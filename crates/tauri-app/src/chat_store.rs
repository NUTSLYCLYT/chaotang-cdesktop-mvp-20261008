use sqlx::{Connection, SqliteConnection, sqlite::SqliteConnectOptions};
use tauri::Manager;

use crate::chaotang_provider::ChaotangProviderState;

async fn connect(app: &tauri::AppHandle) -> Result<SqliteConnection, String> {
    let dir = app.path().app_data_dir().map_err(|_| "无法定位会话目录")?;
    std::fs::create_dir_all(&dir).map_err(|_| "无法创建会话目录")?;
    open_database(dir.join("consultations.sqlite")).await
}

async fn open_database(path: std::path::PathBuf) -> Result<SqliteConnection, String> {
    let mut db = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .busy_timeout(std::time::Duration::from_secs(10)),
    )
    .await
    .map_err(|_| "无法打开会话数据库")?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS chat_accounts (owner TEXT PRIMARY KEY, body TEXT NOT NULL)",
    )
    .execute(&mut db)
    .await
    .map_err(|_| "无法初始化会话数据库")?;
    Ok(db)
}

#[tauri::command]
pub async fn chat_store_load(
    app: tauri::AppHandle,
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Option<String>, String> {
    let owner = state.current_user().await?.ok_or("请先登录以读取对话")?.id;
    let mut db = connect(&app).await?;
    sqlx::query_scalar("SELECT body FROM chat_accounts WHERE owner = ?")
        .bind(owner)
        .fetch_optional(&mut db)
        .await
        .map_err(|_| "读取会话失败".into())
}

#[tauri::command]
pub async fn chat_store_save(
    app: tauri::AppHandle,
    state: tauri::State<'_, ChaotangProviderState>,
    body: String,
    owner_id: String,
) -> Result<(), String> {
    let owner = state.current_user().await?.ok_or("请先登录以保存对话")?.id;
    if owner != owner_id {
        return Err("账户已切换，停止保存旧账户记录".into());
    }
    if body.len() > 20_000_000 || serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return Err("会话记录格式无效或超过本地容量限制".into());
    }
    let mut db = connect(&app).await?;
    sqlx::query("INSERT INTO chat_accounts(owner, body) VALUES(?, ?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body")
        .bind(owner).bind(body).execute(&mut db).await.map_err(|_| "保存会话失败".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn history_survives_reopen_and_accounts_are_separate() {
        let path =
            std::env::temp_dir().join(format!("chat-store-test-{}.sqlite", uuid::Uuid::new_v4()));
        let mut db = open_database(path.clone()).await.unwrap();
        sqlx::query("INSERT INTO chat_accounts(owner, body) VALUES(?, ?)")
            .bind("account-a")
            .bind(r#"{"messages":["第一句","第二句"]}"#)
            .execute(&mut db)
            .await
            .unwrap();
        db.close().await.unwrap();
        let mut reopened = open_database(path.clone()).await.unwrap();
        let saved: String = sqlx::query_scalar("SELECT body FROM chat_accounts WHERE owner=?")
            .bind("account-a")
            .fetch_one(&mut reopened)
            .await
            .unwrap();
        assert!(saved.contains("第一句") && saved.contains("第二句"));
        let other: Option<String> =
            sqlx::query_scalar("SELECT body FROM chat_accounts WHERE owner=?")
                .bind("account-b")
                .fetch_optional(&mut reopened)
                .await
                .unwrap();
        assert!(other.is_none());
        reopened.close().await.unwrap();
        std::fs::remove_file(path).unwrap();
    }
}
