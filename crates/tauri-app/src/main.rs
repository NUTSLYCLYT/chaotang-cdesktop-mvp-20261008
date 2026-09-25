// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
use std::path::PathBuf;
use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use services::services::{
    config::load_config_from_file,
    notification::{NotificationService, PushNotifier, set_global_push_notifier},
};
use tauri::{Emitter, Listener, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use tokio::{sync::Mutex, time::sleep};
use tokio_util::sync::CancellationToken;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::config_path,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};
use uuid::Uuid;

use crate::chaotang_provider::{
    ChaotangProviderState, chaotang_cancel_decree_job, chaotang_cash_safety_evaluate,
    chaotang_chancellor_consult, chaotang_chancellor_draft, chaotang_confirm_daily_memorial,
    chaotang_connector_catalog, chaotang_create_qintian_forecast, chaotang_current_user,
    chaotang_dadian_overview, chaotang_daily_memorial_latest, chaotang_decree_job,
    chaotang_decree_jobs, chaotang_decree_workspace, chaotang_download_workspace_artifact,
    chaotang_fusion_capabilities, chaotang_health, chaotang_hubu_confirm_artifact,
    chaotang_hubu_download_artifact, chaotang_hubu_work_product, chaotang_hubu_work_products,
    chaotang_issue_chancellor_decree, chaotang_jinyiwei_investigation,
    chaotang_jinyiwei_investigations, chaotang_jinyiwei_summary, chaotang_junjichu_case,
    chaotang_junjichu_cases, chaotang_login, chaotang_logout, chaotang_mcp_catalog,
    chaotang_qintian_consult, chaotang_qintian_forecast, chaotang_qintian_forecasts,
    chaotang_qintian_pending_triggers, chaotang_readiness, chaotang_register,
    chaotang_retry_decree_job, chaotang_review_qintian_forecast, chaotang_shiguan_archive,
    chaotang_shiguan_archives, chaotang_shiguan_decision, chaotang_shiguan_recall,
    chaotang_shiguan_review, chaotang_shiguan_statistics, chaotang_skill_catalog,
};

const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

fn configured_start_route() -> String {
    start_route(
        std::env::var("CDESKTOP_START_ROUTE").ok().as_deref(),
        std::env::var("CDESKTOP_START_JOB_ID").ok().as_deref(),
    )
    .expect("Invalid desktop task restore configuration")
}

fn start_route(route: Option<&str>, job: Option<&str>) -> Result<String, &'static str> {
    if route != Some("/court-workspace") {
        return Ok("/today".into());
    }
    let Some(job) = job else {
        return Ok("/court-workspace".into());
    };
    if job.is_empty()
        || job.len() > 128
        || !job
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
    {
        return Err("Invalid desktop task restore identifier");
    }
    Ok(format!("/court-workspace?job={job}"))
}

mod artifact_save;
mod chaotang_provider;
mod chaotang_runtime;
mod chat_store;
mod fusion_owner_runtime;
mod fusion_startup;
mod session_store;

#[cfg(target_os = "linux")]
mod linux_notifications;
#[cfg(target_os = "macos")]
mod macos_notifications;
#[cfg(target_os = "windows")]
mod windows_notifications;

/// Native push notifier for backend-initiated notifications.
/// Uses platform-native APIs with click handling where available,
/// falls back to `tauri-plugin-notification` otherwise.
struct TauriNotifier {
    app_handle: tauri::AppHandle,
}

/// Whether platform-native notifications with click handling are available.
fn use_native_notifications() -> bool {
    #[cfg(target_os = "macos")]
    return macos_notifications::is_available();
    #[cfg(target_os = "windows")]
    return windows_notifications::is_available();
    #[cfg(target_os = "linux")]
    return linux_notifications::is_available();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    false
}

/// Show a notification using the platform-native API (with click handling).
fn show_native_notification(title: &str, body: &str, deeplink_path: Option<&str>) {
    #[cfg(target_os = "macos")]
    macos_notifications::show_notification(title, body, deeplink_path);
    #[cfg(target_os = "windows")]
    windows_notifications::show_notification(title, body, deeplink_path);
    #[cfg(target_os = "linux")]
    linux_notifications::show_notification(title, body, deeplink_path);
}

#[tauri::command]
async fn show_system_notification(
    title: String,
    body: String,
    deeplink_path: Option<String>,
) -> Result<(), String> {
    if use_native_notifications() {
        show_native_notification(&title, &body, deeplink_path.as_deref());
        return Ok(());
    }

    // Fallback: generic NotificationService (e.g. macOS dev mode).
    let config = load_config_from_file(&config_path()).await;
    let notification_service = NotificationService::new(Arc::new(tokio::sync::RwLock::new(config)));
    notification_service.notify(&title, &body, None).await;
    Ok(())
}

#[tauri::command]
fn read_clipboard_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[async_trait]
impl PushNotifier for TauriNotifier {
    async fn send(&self, title: &str, message: &str, workspace_id: Option<Uuid>) {
        let deeplink_path = workspace_id.map(|id| format!("/workspaces/{id}"));

        if use_native_notifications() {
            show_native_notification(title, message, deeplink_path.as_deref());
            return;
        }

        // Fallback: tauri-plugin-notification (no click handling).
        if let Err(e) = self
            .app_handle
            .notification()
            .builder()
            .title(title)
            .body(message)
            .show()
        {
            tracing::warn!("Failed to send Tauri notification: {}", e);
        }
    }
}

fn external_backend_mode(flag: Option<&str>, base_url: Option<&str>) -> Result<bool, &'static str> {
    match flag {
        None => return Ok(false),
        Some("1") => {}
        _ => return Err("CHAOTANG_EXTERNAL_BACKEND_ONLY must be 1 when set"),
    }
    let raw = base_url.ok_or("External backend mode requires CHAOTANG_BACKEND_BASE_URL")?;
    if raw.trim() != raw {
        return Err("External backend URL must not contain surrounding whitespace");
    }
    let url = reqwest::Url::parse(raw).map_err(|_| "Invalid external backend URL")?;
    let host = url.host_str().ok_or("External backend host is required")?;
    let loopback = host
        .trim_matches(['[', ']'])
        .parse::<std::net::IpAddr>()
        .map(|address| address.is_loopback())
        .unwrap_or(false);
    if !matches!(url.scheme(), "http" | "https")
        || !loopback
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(
            "External backend must be an explicit loopback HTTP(S) origin without credentials",
        );
    }
    Ok(true)
}

fn main() {
    // Private child branch must precede every asset/config/Tauri initialization.
    if std::env::args_os().any(|arg| arg == "--fusion-owner-runtime") {
        if std::env::args_os().count() != 2 {
            std::process::exit(2);
        }
        std::process::exit(if server::fusion_owner::run_stdio().is_ok() {
            0
        } else {
            2
        });
    }
    fusion_startup::validate(
        cfg!(chaotang_fusion_build),
        std::env::var("CHAOTANG_EXTERNAL_BACKEND_ONLY")
            .ok()
            .as_deref(),
        std::env::var_os("CDESKTOP_DATA_DIR").as_deref(),
        std::env::var_os("CDESKTOP_WEBVIEW_DATA_DIR").as_deref(),
    )
    .unwrap_or_else(|error| fusion_startup::reject(error));
    let external_backend_only = external_backend_mode(
        std::env::var("CHAOTANG_EXTERNAL_BACKEND_ONLY")
            .ok()
            .as_deref(),
        std::env::var("CHAOTANG_BACKEND_BASE_URL").ok().as_deref(),
    )
    .expect("Invalid isolated Chaotang backend configuration");
    if external_backend_only && std::env::var_os("CDESKTOP_DATA_DIR").is_none() {
        panic!("External backend mode requires an isolated CDESKTOP_DATA_DIR");
    }
    // Validate the explicit directory before loading config, credentials or a database.
    let _isolated_assets = utils::assets::asset_dir();
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level},cdesktop_tauri={level}",
        level = log_level
    );
    let env_filter = EnvFilter::try_new(filter_string).expect("Failed to create tracing filter");

    sentry_utils::init_once(SentrySource::Desktop);

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(env_filter))
        .with(sentry_layer())
        .init();

    // Shared token so we can tell the server to shut down when the app quits.
    let shutdown_token = Arc::new(CancellationToken::new());
    let shutdown_token_for_event = shutdown_token.clone();

    // Holds downloaded update bytes until the app exits or user restarts.
    // Created here (outside setup) so the RunEvent::Exit handler can access it.
    let pending_update: Arc<Mutex<Option<Vec<u8>>>> = Arc::new(Mutex::new(None));
    let pending_for_setup = pending_update.clone();
    let pending_for_exit = pending_update.clone();

    let mut builder = tauri::Builder::default()
        .manage(
            ChaotangProviderState::from_environment()
                .expect("failed to initialize Chaotang provider"),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            fusion_owner_runtime::chaotang_link_decree_workspace,
            fusion_owner_runtime::chaotang_decree_desktop_resources,
            fusion_owner_runtime::chaotang_list_task_files,
            fusion_owner_runtime::chaotang_read_task_file,
            fusion_owner_runtime::chaotang_import_task_artifact,
            fusion_owner_runtime::chaotang_task_session_history,
            fusion_owner_runtime::chaotang_task_diff,
            fusion_owner_runtime::chaotang_start_task_execution,
            fusion_owner_runtime::chaotang_read_task_execution,
            fusion_owner_runtime::chaotang_cancel_task_execution,
            fusion_owner_runtime::chaotang_task_execution_approvals,
            fusion_owner_runtime::chaotang_respond_task_execution_approval,
            fusion_owner_runtime::chaotang_start_task_terminal,
            fusion_owner_runtime::chaotang_read_task_terminal,
            fusion_owner_runtime::chaotang_write_task_terminal,
            fusion_owner_runtime::chaotang_resize_task_terminal,
            fusion_owner_runtime::chaotang_close_task_terminal,
            chat_store::chat_store_load,
            chat_store::chat_store_save,
            chaotang_health,
            chaotang_readiness,
            chaotang_login,
            chaotang_register,
            chaotang_current_user,
            chaotang_logout,
            chaotang_dadian_overview,
            chaotang_daily_memorial_latest,
            chaotang_confirm_daily_memorial,
            chaotang_decree_workspace,
            chaotang_fusion_capabilities,
            chaotang_download_workspace_artifact,
            chaotang_provider::chaotang_save_workspace_artifact,
            chaotang_decree_jobs,
            chaotang_provider::chaotang_set_decree_history_archived,
            chaotang_decree_job,
            chaotang_cancel_decree_job,
            chaotang_retry_decree_job,
            chaotang_chancellor_consult,
            chaotang_chancellor_draft,
            chaotang_issue_chancellor_decree,
            chaotang_junjichu_cases,
            chaotang_junjichu_case,
            chaotang_shiguan_archives,
            chaotang_shiguan_archive,
            chaotang_shiguan_review,
            chaotang_shiguan_decision,
            chaotang_shiguan_statistics,
            chaotang_provider::chaotang_shiguan_outcomes_overview,
            chaotang_provider::chaotang_shiguan_create_outcome,
            chaotang_provider::chaotang_hanlin_experiment,
            chaotang_provider::chaotang_candidate_history,
            chaotang_provider::chaotang_append_candidate_event,
            chaotang_provider::chaotang_runtime_rehearsal_history,
            chaotang_provider::chaotang_append_runtime_rehearsal_event,
            chaotang_shiguan_recall,
            chaotang_qintian_forecasts,
            chaotang_qintian_consult,
            chaotang_qintian_forecast,
            chaotang_qintian_pending_triggers,
            chaotang_create_qintian_forecast,
            chaotang_review_qintian_forecast,
            chaotang_hubu_work_products,
            chaotang_hubu_work_product,
            chaotang_hubu_download_artifact,
            chaotang_hubu_confirm_artifact,
            chaotang_cash_safety_evaluate,
            chaotang_jinyiwei_summary,
            chaotang_jinyiwei_investigations,
            chaotang_jinyiwei_investigation,
            chaotang_skill_catalog,
            chaotang_mcp_catalog,
            chaotang_connector_catalog,
            show_system_notification,
            read_clipboard_text
        ]);

    // Unlock WKWebView's native refresh rate on macOS ProMotion / high-Hz displays.
    // On macOS 13–15 WKWebView caps rAF at 60fps; this plugin disables that cap
    // via WebKit's private _features API. No-op on macOS 26+ (cap removed by Apple).
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_fps::init());
    }

    // Register the updater only when the release configuration contains a real
    // endpoint. Local release builds intentionally keep the placeholder; trying
    // to initialise the plugin with it makes the whole desktop app panic before
    // the first window can render (the user only sees a white window).
    let updater_is_configured =
        !include_str!("../tauri.conf.json").contains("__TAURI_UPDATE_ENDPOINT__");
    if !cfg!(debug_assertions) && updater_is_configured {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(move |app| {
            // Initialize platform-native notifications (request permission,
            // install click-handling delegates) before anything else.
            #[cfg(target_os = "macos")]
            macos_notifications::initialize(app.handle().clone());
            #[cfg(target_os = "windows")]
            windows_notifications::initialize(app.handle().clone());
            #[cfg(target_os = "linux")]
            linux_notifications::initialize(app.handle().clone());

            if cfg!(debug_assertions) {
                // Dev mode: frontend dev server (Vite) and backend are started
                // externally. Use WebviewUrl::External so that macOS WKWebView
                // renders with the same content scaling as the production build.
                let frontend_port =
                    std::env::var("FRONTEND_PORT").unwrap_or_else(|_| "3000".to_string());
                // Open the stable shell route directly. This avoids exposing a
                // blank root document while React is waiting for configuration
                // or when the local backend is still starting.
                let dev_url = format!(
                    "http://localhost:{frontend_port}{}",
                    configured_start_route()
                );
                tracing::info!("Running in dev mode — using external frontend/backend servers (devUrl={dev_url})");
                let window = create_window(
                    app,
                    tauri::WebviewUrl::External(dev_url.parse().unwrap()),
                )?;
                #[cfg(target_os = "macos")]
                {
                    disable_pinch_zoom(&window);
                    optimize_webview_performance(&window);
                }
                let _ = window;
            } else {
                // Production: start the Axum server first, then open the window
                // once it's ready so the user never sees a blank/error page.
                let app_handle = app.handle().clone();
                let resource_dir = app.path().resource_dir().ok();
                let app_data_dir = app.path().app_data_dir().ok();
                let start_route = configured_start_route();

                // Register native Tauri notifications before the server starts.
                set_global_push_notifier(Arc::new(TauriNotifier {
                    app_handle: app_handle.clone(),
                }));

                let token = shutdown_token.clone();
                tauri::async_runtime::spawn(async move {
                    // The frozen sidecar can take longer on its very first
                    // Gatekeeper scan. Start it independently so the desktop UI
                    // renders immediately and transitions from OFFLINE to LIVE.
                    let chaotang_shutdown = token.clone();
                    if !external_backend_only {
                        tauri::async_runtime::spawn(async move {
                        match chaotang_runtime::ensure_started(resource_dir, app_data_dir).await {
                            Ok(child) => {
                                let _owned_child = child;
                                chaotang_shutdown.cancelled().await;
                            }
                            Err(error) => {
                                tracing::error!(
                                    "Chaotang backend auto-start unavailable: {error}"
                                );
                            }
                        }
                        });
                    }
                    match server::startup::start().await {
                        Ok(server_handle) => {
                            let url = format!(
                                "{}{}",
                                server_handle.url().trim_end_matches('/'),
                                start_route
                            );

                            // Create the window on the main thread — macOS
                            // silently drops windows created from async tasks.
                            let url_clone = url.clone();
                            let create_handle = app_handle.clone();
                            let _ = app_handle.run_on_main_thread(move || {
                                let webview_url =
                                    tauri::WebviewUrl::External(url_clone.parse().unwrap());
                                match create_window(&create_handle, webview_url) {
                                    Ok(window) => {
                                        #[cfg(target_os = "macos")]
                                        {
                                            disable_pinch_zoom(&window);
                                            optimize_webview_performance(&window);
                                        }
                                        let _ = window;
                                    }
                                    Err(e) => tracing::error!("Failed to create window: {e}"),
                                }
                            });
                            tracing::info!("Window opened at {url}");

                            // Wait for either the server to exit on its own or
                            // the external shutdown token to be cancelled.
                            let server_token = server_handle.shutdown_token();
                            tauri::async_runtime::spawn(async move {
                                token.cancelled().await;
                                server_token.cancel();
                            });

                            if let Err(e) = server_handle.serve().await {
                                tracing::error!("Server error: {e}");
                            }
                        }
                        Err(e) => {
                            tracing::error!("Server failed to start: {e}");
                        }
                    }
                });

                // Check for updates in the background on startup and then
                // periodically. We only *download* the update here —
                // installing it (which replaces the app bundle on disk) is
                // deferred until the user exits or triggers a restart.
                // Installing while the app is running causes a code-signature
                // mismatch on macOS, which makes NSOpenPanel (and other XPC
                // services) return NULL and crash the app.
                // See tauri-apps/tauri#13047.
                if updater_is_configured {
                    let update_handle = app.handle().clone();
                    let pending_for_download = pending_for_setup.clone();
                    tauri::async_runtime::spawn(async move {
                        run_periodic_update_checks(update_handle, pending_for_download).await;
                    });

                    // Listen for restart request from frontend (after update downloaded).
                    // Install the previously downloaded bytes *now*, then restart.
                    let restart_handle = app.handle().clone();
                    let pending_for_install = pending_for_setup.clone();
                    app.listen("restart-app", move |_| {
                        let handle = restart_handle.clone();
                        let pending = pending_for_install.clone();
                        tauri::async_runtime::spawn(async move {
                            install_pending_update(&handle, &pending).await;
                            handle.restart();
                        });
                    });
                }
            }

            Ok(())
        })
        .on_window_event(move |window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // macOS keeps the conventional dock-app behaviour. Windows
                    // and Linux use the native close path so RunEvent::Exit can
                    // revoke the owner runtime and stop supervised processes.
                    #[cfg(target_os = "macos")]
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    #[cfg(not(target_os = "macos"))]
                    let _ = (api, window);
                }
                tauri::WindowEvent::Destroyed => {
                    // Only fires on actual app exit (e.g. Cmd+Q).
                    shutdown_token_for_event.cancel();
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, _event| {
            // macOS: clicking the dock icon when the window is hidden should reopen it.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_window(_app);
            }

            // Install any pending update when the app exits (e.g. Cmd+Q)
            // so the next launch uses the new version.
            if let tauri::RunEvent::Exit = _event {
                tauri::async_runtime::block_on(_app.state::<ChaotangProviderState>().owner_runtime.revoke(u64::MAX));
                // block_on is safe here — we're on the main (AppKit) thread,
                // not inside the tokio runtime.
                tauri::async_runtime::block_on(install_pending_update(_app, &pending_for_exit));
            }
        });
}

/// Disable trackpad/touchpad pinch-to-zoom on macOS while keeping Cmd+/- zoom.
/// WKWebView handles magnification at the native level — JS `preventDefault()`
/// cannot block it.
#[cfg(target_os = "macos")]
fn disable_pinch_zoom(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| unsafe {
        let wk: &objc2_web_kit::WKWebView = &*webview.inner().cast();
        wk.setAllowsMagnification(false);
    });
}

/// Enable GPU-accelerated compositing and drawing in WKWebView.
///
/// Embedded WKWebView may not have the same GPU acceleration defaults as Safari,
/// contributing to the observed performance gap (Chrome > Safari > Tauri).
/// Sets private WebKit preferences via NSKeyValueCoding (setValue:forKey:)
/// using the same raw msg_send pattern as tauri-plugin-macos-fps.
#[cfg(target_os = "macos")]
fn optimize_webview_performance(window: &tauri::WebviewWindow) {
    use objc2::{
        msg_send,
        runtime::{AnyClass, AnyObject, Bool},
    };

    let _ = window.with_webview(|webview| unsafe {
        let wk: &objc2_web_kit::WKWebView = &*webview.inner().cast();

        let config: *mut AnyObject = msg_send![wk, configuration];
        if config.is_null() {
            tracing::warn!("WebView optimization: WKWebViewConfiguration is null");
            return;
        }
        let prefs: *mut AnyObject = msg_send![config, preferences];
        if prefs.is_null() {
            tracing::warn!("WebView optimization: WKPreferences is null");
            return;
        }

        let ns_num_cls = match AnyClass::get(c"NSNumber") {
            Some(cls) => cls,
            None => return,
        };
        let yes: *mut AnyObject = msg_send![ns_num_cls, numberWithBool: Bool::new(true)];

        for key_str in ["acceleratedCompositingEnabled", "acceleratedDrawingEnabled"] {
            let key = objc2_foundation::NSString::from_str(key_str);
            let _: () = msg_send![prefs, setValue: yes, forKey: &*key];
        }

        tracing::info!(
            "WebView: GPU acceleration enabled (acceleratedCompositingEnabled + acceleratedDrawingEnabled)"
        );
    });
}

#[cfg(target_os = "macos")]
fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn create_window<R: tauri::Runtime, M: tauri::Manager<R>>(
    manager: &M,
    url: tauri::WebviewUrl,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let handle = manager.app_handle().clone();
    let builder = tauri::WebviewWindowBuilder::new(manager, "main", url)
        .title("朝堂 AI OS")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        // Windows is visible from creation so a missed WebView load callback
        // cannot leave a healthy process hidden. The dark background below
        // prevents a white flash while React starts.
        .visible(cfg!(target_os = "windows"))
        // Keep the native surface aligned with the product theme while React
        // and the embedded V2 shell initialise.
        .background_color(tauri::utils::config::Color(5, 11, 9, 255))
        .zoom_hotkeys_enabled(false)
        .disable_drag_drop_handler()
        .on_page_load(|window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                tracing::info!(url = %payload.url(), "Main window page load finished");
                if let Err(error) = window.show() {
                    tracing::error!(%error, "Failed to show the main window after page load");
                }
                if let Err(error) = window.set_focus() {
                    tracing::warn!(%error, "Failed to focus the main window after page load");
                }
            }
        });

    // The fusion acceptance launcher gives WebView2 its own workspace-owned
    // profile. This prevents a crashed/stale acceptance run from contending
    // with the installed cdesktop profile and keeps all test state isolated.
    #[cfg(target_os = "windows")]
    let builder = match std::env::var_os("CDESKTOP_WEBVIEW_DATA_DIR") {
        Some(directory) if !directory.is_empty() => {
            let directory = PathBuf::from(directory);
            tracing::info!(path = %directory.display(), "Using isolated WebView2 data directory");
            builder.data_directory(directory)
        }
        _ => builder,
    };

    // macOS: overlay title bar keeps traffic lights but removes title bar chrome,
    // letting web content extend to the top of the window.
    // Traffic lights are vertically centered within the navbar height (~28px).
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(8.0, 14.0));

    builder
        .on_new_window(move |url, _features| {
            tracing::info!("New window requested for URL: {}", url);
            let url_str = url.to_string();
            let _ = handle.opener().open_url(&url_str, None::<&str>);
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
}

/// Takes the pending update bytes (if any) and installs them.
/// Requires a network call to re-fetch the `Update` metadata.
async fn install_pending_update(app: &tauri::AppHandle, pending: &Mutex<Option<Vec<u8>>>) {
    let bytes = match pending.lock().await.take() {
        Some(b) => b,
        None => return,
    };
    tracing::info!("Installing pending update…");
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("Failed to init updater for install: {e}");
            return;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            if let Err(e) = update.install(bytes) {
                tracing::error!("Failed to install update: {e}");
            } else {
                tracing::info!("Update installed, will apply on next launch");
            }
        }
        Ok(None) => {
            tracing::warn!("Update no longer available when trying to install");
        }
        Err(e) => {
            tracing::error!("Failed to check for update during install: {e}");
        }
    }
}

async fn check_for_updates(app: tauri::AppHandle, pending_update: Arc<Mutex<Option<Vec<u8>>>>) {
    let has_pending_update = pending_update.lock().await.is_some();
    if has_pending_update {
        tracing::info!("Update already downloaded; skipping update check");
        return;
    }

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(e) => {
            tracing::warn!("Failed to initialize updater: {}", e);
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            tracing::info!(
                "Update available: {} -> {}",
                update.current_version,
                update.version
            );

            let _ = app.emit(
                "update-available",
                serde_json::json!({
                    "currentVersion": update.current_version.to_string(),
                    "newVersion": update.version.to_string(),
                    "body": update.body
                }),
            );

            // Only *download* the update — do NOT install yet.
            // Installing replaces the app bundle on disk which
            // invalidates the code signature of the running process,
            // causing macOS XPC services (NSOpenPanel etc.) to fail.
            let new_version = update.version.to_string();
            match update.download(|_, _| {}, || {}).await {
                Ok(bytes) => {
                    tracing::info!("Update {new_version} downloaded, waiting for user to restart");
                    *pending_update.lock().await = Some(bytes);
                    let _ = app.emit(
                        "update-installed",
                        serde_json::json!({ "newVersion": new_version }),
                    );
                }
                Err(e) => {
                    tracing::error!("Failed to download update: {}", e);
                }
            }
        }
        Ok(None) => {
            tracing::info!("No updates available");
        }
        Err(e) => {
            tracing::warn!("Failed to check for updates: {}", e);
        }
    }
}

async fn run_periodic_update_checks(
    app: tauri::AppHandle,
    pending_update: Arc<Mutex<Option<Vec<u8>>>>,
) {
    check_for_updates(app.clone(), pending_update.clone()).await;

    loop {
        sleep(UPDATE_CHECK_INTERVAL).await;
        check_for_updates(app.clone(), pending_update.clone()).await;
    }
}

#[cfg(test)]
mod isolated_backend_tests {
    use super::external_backend_mode;

    #[test]
    fn restore_job_is_only_an_opaque_court_route_parameter() {
        assert_eq!(super::start_route(None, None), Ok("/today".into()));
        assert_eq!(
            super::start_route(Some("/court-workspace"), None),
            Ok("/court-workspace".into())
        );
        assert_eq!(
            super::start_route(Some("/court-workspace"), Some("job_1-A")),
            Ok("/court-workspace?job=job_1-A".into())
        );
        assert_eq!(
            super::start_route(Some("/today"), Some("job_1-A")),
            Ok("/today".into())
        );
        for value in [
            "",
            "../other",
            "job&create=true",
            "https://evil.test",
            " job",
            "中文",
        ] {
            assert!(super::start_route(Some("/court-workspace"), Some(value)).is_err());
        }
        assert!(super::start_route(Some("/court-workspace"), Some(&"x".repeat(129))).is_err());
    }

    #[test]
    fn isolated_backend_requires_an_explicit_loopback_origin() {
        assert_eq!(external_backend_mode(None, None), Ok(false));
        assert_eq!(
            external_backend_mode(Some("1"), Some("http://127.0.0.1:18991")),
            Ok(true)
        );
        assert_eq!(
            external_backend_mode(Some("1"), Some("http://[::1]:18991")),
            Ok(true)
        );
        for bad in [
            "https://example.com",
            "http://localhost:18991",
            "http://127.0.0.1.evil.test",
            "http://user@127.0.0.1:18991",
            "http://127.0.0.1:18991/api",
            "http://127.0.0.1:18991?token=x",
            " http://127.0.0.1:18991",
        ] {
            assert!(
                external_backend_mode(Some("1"), Some(bad)).is_err(),
                "{bad}"
            );
        }
        assert!(external_backend_mode(Some("1"), None).is_err());
        assert!(external_backend_mode(Some("true"), Some("http://127.0.0.1:18991")).is_err());
    }
}
