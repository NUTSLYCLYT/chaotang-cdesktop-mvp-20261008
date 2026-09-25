use std::sync::atomic::{AtomicU64, Ordering};

use super::*;

fn fixture() -> (OwnerRuntimeAccess, RuntimeCredential, Arc<AtomicU64>) {
    let clock = Arc::new(AtomicU64::new(100));
    let time = clock.clone();
    let nonce = AtomicU64::new(1);
    let (access, credential) = OwnerRuntimeAccess::with_sources(
        "owner-from-native".into(),
        "generation-1".into(),
        Arc::new(move || Duration::from_secs(time.load(Ordering::SeqCst))),
        Arc::new(move || {
            let mut bytes = [0_u8; 32];
            bytes[..8].copy_from_slice(&nonce.fetch_add(1, Ordering::SeqCst).to_be_bytes());
            Ok(bytes)
        }),
    )
    .unwrap();
    (access, credential, clock)
}

fn workspace() -> uuid::Uuid {
    uuid::Uuid::from_u128(17)
}
fn metadata_path() -> String {
    format!("/api/workspaces/{}", workspace())
}
fn stream_path() -> String {
    format!("/api/workspaces/{}/git/diff/ws", workspace())
}

#[test]
fn no_path_is_open_until_native_resource_grant() {
    let (access, key, _) = fixture();
    let header = access
        .issue_http_capability(&key, "generation-1")
        .unwrap()
        .bearer_header();
    assert!(
        access
            .authorize_http(&header, "GET", &metadata_path())
            .is_err()
    );
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    let grant = access
        .authorize_http(&header, "GET", &metadata_path())
        .unwrap();
    assert_eq!(grant.owner_id, "owner-from-native");
    assert_eq!(grant.generation, "generation-1");
    assert!(
        access
            .authorize_http("Bearer forged", "GET", &metadata_path())
            .is_err()
    );
    assert!(
        access
            .authorize_http(&header, "POST", &metadata_path())
            .is_err()
    );
}

#[test]
fn global_and_ambiguous_paths_never_gain_permission() {
    let (access, key, _) = fixture();
    let header = access
        .issue_http_capability(&key, "generation-1")
        .unwrap()
        .bearer_header();
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    for path in [
        "/api/filesystem/directory",
        "/api/preview/8000",
        "/api/terminal/ws",
        "/api/host/a",
        "/api/remote",
        "/api/relay-auth/server",
        "/api/events",
        "/api/approvals/stream/ws",
        "/api/workspaces",
        "/api/repos",
        "/api/search",
    ] {
        assert!(
            access.authorize_http(&header, "GET", path).is_err(),
            "{path}"
        );
        assert!(
            access.issue_ws_ticket(&key, "generation-1", path).is_err(),
            "{path}"
        );
    }
    for suffix in ["?owner=other", "/..", "%2f", "?x=1", "//", "#x"] {
        assert!(
            access
                .authorize_http(&header, "GET", &format!("{}{suffix}", metadata_path()))
                .is_err()
        );
    }
}

#[test]
fn ws_tickets_are_path_bound_single_use_and_expire_at_deadline() {
    let (access, key, time) = fixture();
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    let ticket = access
        .issue_ws_ticket(&key, "generation-1", &stream_path())
        .unwrap();
    assert!(
        access
            .consume_ws_ticket(ticket.expose(), "/api/approvals/stream/ws")
            .is_err()
    );
    assert!(
        access
            .consume_ws_ticket(ticket.expose(), &stream_path())
            .is_ok()
    );
    assert!(
        access
            .consume_ws_ticket(ticket.expose(), &stream_path())
            .is_err()
    );
    let expired = access
        .issue_ws_ticket(&key, "generation-1", &stream_path())
        .unwrap();
    time.store(130, Ordering::SeqCst);
    assert!(
        access
            .consume_ws_ticket(expired.expose(), &stream_path())
            .is_err()
    );
}

#[test]
fn revocation_invalidates_http_pending_tickets_and_existing_grants() {
    let (access, key, _) = fixture();
    let header = access
        .issue_http_capability(&key, "generation-1")
        .unwrap()
        .bearer_header();
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    let grant = access
        .authorize_http(&header, "GET", &metadata_path())
        .unwrap();
    let ticket = access
        .issue_ws_ticket(&key, "generation-1", &stream_path())
        .unwrap();
    access.revoke().unwrap();
    assert!(!access.is_current(&grant));
    assert!(
        access
            .authorize_http(&header, "GET", &metadata_path())
            .is_err()
    );
    assert!(
        access
            .consume_ws_ticket(ticket.expose(), &stream_path())
            .is_err()
    );
    assert!(
        access
            .grant_read_resource(ReadResource::Workspace(workspace()))
            .is_err()
    );
}

#[test]
fn concurrent_ticket_consumption_has_exactly_one_winner() {
    let (access, key, _) = fixture();
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    let ticket = access
        .issue_ws_ticket(&key, "generation-1", &stream_path())
        .unwrap();
    let access = Arc::new(access);
    let threads: Vec<_> = (0..12)
        .map(|_| {
            let state = access.clone();
            let secret = ticket.expose().to_string();
            std::thread::spawn(move || state.consume_ws_ticket(&secret, &stream_path()).is_ok())
        })
        .collect();
    assert_eq!(
        threads
            .into_iter()
            .filter_map(|t| t.join().ok())
            .filter(|v| *v)
            .count(),
        1
    );
}

#[test]
fn secrets_never_appear_in_debug_or_errors_and_ticket_queue_is_bounded() {
    let (access, key, time) = fixture();
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    assert!(!format!("{access:?} {key:?}").contains(key.expose()));
    for _ in 0..MAX_PENDING_TICKETS {
        let ticket = access
            .issue_ws_ticket(&key, "generation-1", &stream_path())
            .unwrap();
        assert!(!format!("{ticket:?}").contains(ticket.expose()));
    }
    let error = access
        .issue_ws_ticket(&key, "generation-1", &stream_path())
        .unwrap_err();
    assert!(!format!("{error:?} {error}").contains(key.expose()));
    time.store(131, Ordering::SeqCst);
    assert!(
        access
            .issue_ws_ticket(&key, "generation-1", &stream_path())
            .is_ok()
    );
}

#[test]
fn session_permissions_do_not_grant_workspace_or_mutations() {
    let (access, key, _) = fixture();
    let header = access
        .issue_http_capability(&key, "generation-1")
        .unwrap()
        .bearer_header();
    let id = uuid::Uuid::from_u128(22);
    access
        .grant_read_resource(ReadResource::Session(id))
        .unwrap();
    assert!(
        access
            .authorize_http(&header, "GET", &format!("/api/sessions/{id}"))
            .is_ok()
    );
    assert!(
        access
            .authorize_http(&header, "GET", &metadata_path())
            .is_err()
    );
    assert!(
        access
            .authorize_http(&header, "POST", &format!("/api/sessions/{id}/follow-up"))
            .is_err()
    );
}

#[test]
fn http_capability_is_short_lived_and_private_credential_is_not_an_http_token() {
    let (access, key, time) = fixture();
    access
        .grant_read_resource(ReadResource::Workspace(workspace()))
        .unwrap();
    let dto = access.issue_http_capability(&key, "generation-1").unwrap();
    assert_eq!(dto.expires_at, 160_000);
    assert_eq!(dto.token.len(), 64);
    assert!(
        dto.token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    );
    assert!(
        access
            .authorize_http(&key.bearer_header(), "GET", &metadata_path())
            .is_err()
    );
    assert!(
        access
            .issue_http_capability(&key, "other-generation")
            .is_err()
    );
    assert!(
        access
            .issue_ws_ticket(&key, "other-generation", &stream_path())
            .is_err()
    );
    time.store(160, Ordering::SeqCst);
    assert!(
        access
            .authorize_http(&dto.bearer_header(), "GET", &metadata_path())
            .is_err()
    );
    let wire = serde_json::to_value(&dto).unwrap();
    assert_eq!(wire["expiresAt"], 160_000);
    assert_eq!(wire["generation"], "generation-1");
    assert!(!format!("{dto:?}").contains(&dto.token));
}

#[test]
fn invalid_issuer_generation_and_entropy_failure_are_closed() {
    let (access, _, _) = fixture();
    let forged = RuntimeCredential("f".repeat(64));
    assert!(
        access
            .issue_http_capability(&forged, "generation-1")
            .is_err()
    );
    assert!(
        OwnerRuntimeAccess::with_sources(
            "owner".into(),
            "".into(),
            Arc::new(|| Duration::ZERO),
            Arc::new(|| Ok([1; 32]))
        )
        .is_err()
    );
    assert!(
        OwnerRuntimeAccess::with_sources(
            "owner".into(),
            "generation".into(),
            Arc::new(|| Duration::ZERO),
            Arc::new(|| Err(AccessError::Unavailable))
        )
        .is_err()
    );
    let (stuck_rng, key) = OwnerRuntimeAccess::with_sources(
        "owner".into(),
        "generation".into(),
        Arc::new(|| Duration::ZERO),
        Arc::new(|| Ok([1; 32])),
    )
    .unwrap();
    assert!(stuck_rng.issue_http_capability(&key, "generation").is_err());
}
