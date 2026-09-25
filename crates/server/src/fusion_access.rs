//! Dormant authorization primitive for a future dedicated owner runtime.
//!
//! NOT mounted on existing routers. Native code must authenticate owner provenance,
//! isolate runtime data, verify each granted resource, and close running connections
//! when `is_current` becomes false. This is NOT an OS sandbox: same-OS-user shell
//! access remains trusted host access. No filesystem, PTY, preview, global list,
//! relay, mutation, or arbitrary-path capability is granted by this module.

use std::{
    collections::HashSet,
    fmt,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use aws_lc_rs::constant_time::verify_slices_are_equal;
use rand::{RngCore, rngs::OsRng};
use serde::Serialize;
use uuid::Uuid;

const MAX_PENDING_TICKETS: usize = 128;
const HTTP_TTL_MS: u64 = 60_000;
const WS_TTL_MS: u64 = 30_000;
type Clock = Arc<dyn Fn() -> Duration + Send + Sync>;
type Entropy = Arc<dyn Fn() -> Result<[u8; 32], AccessError> + Send + Sync>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum AccessError {
    #[error("runtime access denied")]
    Denied,
    #[error("runtime access unavailable")]
    Unavailable,
    #[error("runtime capability capacity reached")]
    Capacity,
}

/// Private native issuer credential. Never serialize or return this to a webview.
pub struct RuntimeCredential(String);
impl RuntimeCredential {
    pub fn expose(&self) -> &str {
        &self.0
    }
    pub fn bearer_header(&self) -> String {
        format!("Bearer {}", self.0)
    }
}
impl fmt::Debug for RuntimeCredential {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("RuntimeCredential([REDACTED])")
    }
}

/// Explicit short-lived wire DTO; the token may be retained only in client memory.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpCapability {
    pub generation: String,
    pub token: String,
    pub expires_at: u64,
}
impl HttpCapability {
    pub fn bearer_header(&self) -> String {
        format!("Bearer {}", self.token)
    }
}
impl fmt::Debug for HttpCapability {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("HttpCapability([REDACTED])")
    }
}

/// Send ticket as `Sec-WebSocket-Protocol: fusion-ticket.<ticket>`, never URL query.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSocketTicket {
    pub generation: String,
    pub path: String,
    pub ticket: String,
    pub expires_at: u64,
}
impl WebSocketTicket {
    pub fn expose(&self) -> &str {
        &self.ticket
    }
}
impl fmt::Debug for WebSocketTicket {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("WebSocketTicket([REDACTED])")
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AccessGrant {
    pub owner_id: String,
    pub generation: String,
}
#[derive(Clone, Copy, Debug)]
pub enum ReadResource {
    Workspace(Uuid),
    Session(Uuid),
}

struct Pending {
    token: String,
    path: String,
    expires_at: u64,
    generation: String,
}
struct Inner {
    generation: String,
    active: bool,
    private_key: String,
    http_paths: HashSet<String>,
    ws_paths: HashSet<String>,
    http: Vec<Pending>,
    ws: Vec<Pending>,
}

pub struct OwnerRuntimeAccess {
    owner_id: String,
    inner: Mutex<Inner>,
    clock: Clock,
    entropy: Entropy,
}
impl fmt::Debug for OwnerRuntimeAccess {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("OwnerRuntimeAccess([REDACTED])")
    }
}

fn matches_secret(expected: &str, supplied: &str) -> bool {
    supplied.len() == 64
        && verify_slices_are_equal(expected.as_bytes(), supplied.as_bytes()).is_ok()
}

fn hex(bytes: [u8; 32]) -> String {
    const ALPHABET: &[u8; 16] = b"0123456789abcdef";
    bytes
        .into_iter()
        .flat_map(|byte| {
            [
                ALPHABET[(byte >> 4) as usize] as char,
                ALPHABET[(byte & 15) as usize] as char,
            ]
        })
        .collect()
}

impl OwnerRuntimeAccess {
    /// `owner_id` must come from authenticated native/backend identity, never a request field.
    pub fn new(
        owner_id: String,
        generation: String,
    ) -> Result<(Self, RuntimeCredential), AccessError> {
        let epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AccessError::Unavailable)?;
        let start = Instant::now();
        Self::with_sources(
            owner_id,
            generation,
            Arc::new(move || epoch.saturating_add(start.elapsed())),
            Arc::new(|| {
                let mut bytes = [0; 32];
                OsRng
                    .try_fill_bytes(&mut bytes)
                    .map_err(|_| AccessError::Unavailable)?;
                Ok(bytes)
            }),
        )
    }

    fn with_sources(
        owner_id: String,
        generation: String,
        clock: Clock,
        entropy: Entropy,
    ) -> Result<(Self, RuntimeCredential), AccessError> {
        if owner_id.trim().is_empty()
            || owner_id.len() > 200
            || generation.trim().is_empty()
            || generation.len() > 128
        {
            return Err(AccessError::Denied);
        }
        let private_key = hex(entropy()?);
        let credential = RuntimeCredential(private_key.clone());
        Ok((
            Self {
                owner_id,
                clock,
                entropy,
                inner: Mutex::new(Inner {
                    generation,
                    active: true,
                    private_key,
                    http_paths: HashSet::new(),
                    ws_paths: HashSet::new(),
                    http: Vec::new(),
                    ws: Vec::new(),
                }),
            },
            credential,
        ))
    }

    fn now(&self) -> Result<u64, AccessError> {
        (self.clock)()
            .as_millis()
            .try_into()
            .map_err(|_| AccessError::Unavailable)
    }
    fn grant(&self, inner: &Inner) -> AccessGrant {
        AccessGrant {
            owner_id: self.owner_id.clone(),
            generation: inner.generation.clone(),
        }
    }
    fn issuer(
        inner: &Inner,
        credential: &RuntimeCredential,
        generation: &str,
    ) -> Result<(), AccessError> {
        if !inner.active
            || inner.generation != generation
            || !matches_secret(&inner.private_key, credential.expose())
        {
            return Err(AccessError::Denied);
        }
        Ok(())
    }

    /// Native-only after backend ownership and physical resource provenance checks.
    /// Exact paths include no query strings; all unspecified routes/methods remain denied.
    pub fn grant_read_resource(&self, resource: ReadResource) -> Result<(), AccessError> {
        let mut inner = self.inner.lock().map_err(|_| AccessError::Unavailable)?;
        if !inner.active {
            return Err(AccessError::Denied);
        }
        match resource {
            ReadResource::Workspace(id) => {
                inner.http_paths.insert(format!("/api/workspaces/{id}"));
                inner
                    .ws_paths
                    .insert(format!("/api/workspaces/{id}/sessions/ws"));
                inner
                    .ws_paths
                    .insert(format!("/api/workspaces/{id}/git/diff/ws"));
            }
            ReadResource::Session(id) => {
                inner.http_paths.insert(format!("/api/sessions/{id}"));
            }
        }
        Ok(())
    }

    pub fn issue_http_capability(
        &self,
        credential: &RuntimeCredential,
        generation: &str,
    ) -> Result<HttpCapability, AccessError> {
        let mut inner = self.inner.lock().map_err(|_| AccessError::Unavailable)?;
        Self::issuer(&inner, credential, generation)?;
        let now = self.now()?;
        inner.http.retain(|item| item.expires_at > now);
        if inner.http.len() >= MAX_PENDING_TICKETS {
            return Err(AccessError::Capacity);
        }
        let token = self.unique_token(&inner)?;
        let expires_at = now
            .checked_add(HTTP_TTL_MS)
            .ok_or(AccessError::Unavailable)?;
        inner.http.push(Pending {
            token: token.clone(),
            path: String::new(),
            expires_at,
            generation: generation.into(),
        });
        Ok(HttpCapability {
            generation: generation.into(),
            token,
            expires_at,
        })
    }

    fn unique_token(&self, inner: &Inner) -> Result<String, AccessError> {
        let value = hex((self.entropy)()?);
        if matches_secret(&inner.private_key, &value)
            || inner
                .http
                .iter()
                .chain(inner.ws.iter())
                .any(|item| matches_secret(&item.token, &value))
        {
            return Err(AccessError::Unavailable);
        }
        Ok(value)
    }

    pub fn authorize_http(
        &self,
        authorization: &str,
        method: &str,
        exact_path: &str,
    ) -> Result<AccessGrant, AccessError> {
        let inner = self.inner.lock().map_err(|_| AccessError::Unavailable)?;
        let supplied = authorization
            .strip_prefix("Bearer ")
            .ok_or(AccessError::Denied)?;
        let now = self.now()?;
        if !inner.active
            || method != "GET"
            || !inner.http_paths.contains(exact_path)
            || !inner.http.iter().any(|item| {
                item.expires_at > now
                    && item.generation == inner.generation
                    && matches_secret(&item.token, supplied)
            })
        {
            return Err(AccessError::Denied);
        }
        Ok(self.grant(&inner))
    }

    pub fn issue_ws_ticket(
        &self,
        credential: &RuntimeCredential,
        generation: &str,
        exact_path: &str,
    ) -> Result<WebSocketTicket, AccessError> {
        let mut inner = self.inner.lock().map_err(|_| AccessError::Unavailable)?;
        Self::issuer(&inner, credential, generation)?;
        if !inner.ws_paths.contains(exact_path) {
            return Err(AccessError::Denied);
        }
        let now = self.now()?;
        inner.ws.retain(|item| item.expires_at > now);
        if inner.ws.len() >= MAX_PENDING_TICKETS {
            return Err(AccessError::Capacity);
        }
        let ticket = self.unique_token(&inner)?;
        let expires_at = now.checked_add(WS_TTL_MS).ok_or(AccessError::Unavailable)?;
        inner.ws.push(Pending {
            token: ticket.clone(),
            path: exact_path.into(),
            expires_at,
            generation: generation.into(),
        });
        Ok(WebSocketTicket {
            generation: generation.into(),
            path: exact_path.into(),
            ticket,
            expires_at,
        })
    }

    pub fn consume_ws_ticket(
        &self,
        ticket: &str,
        exact_path: &str,
    ) -> Result<AccessGrant, AccessError> {
        let mut inner = self.inner.lock().map_err(|_| AccessError::Unavailable)?;
        if !inner.active || !inner.ws_paths.contains(exact_path) {
            return Err(AccessError::Denied);
        }
        let now = self.now()?;
        let index = inner
            .ws
            .iter()
            .position(|item| {
                item.path == exact_path
                    && item.expires_at > now
                    && item.generation == inner.generation
                    && matches_secret(&item.token, ticket)
            })
            .ok_or(AccessError::Denied)?;
        inner.ws.swap_remove(index);
        Ok(self.grant(&inner))
    }

    /// Terminal revocation. Create a fresh isolated runtime for another login.
    pub fn revoke(&self) -> Result<(), AccessError> {
        let mut inner = self.inner.lock().map_err(|_| AccessError::Unavailable)?;
        inner.active = false;
        inner.generation = "revoked".into();
        inner.http.clear();
        inner.ws.clear();
        inner.http_paths.clear();
        inner.ws_paths.clear();
        Ok(())
    }

    /// Caller must use this to cancel live streams/actions; it does not stop processes itself.
    pub fn is_current(&self, grant: &AccessGrant) -> bool {
        self.inner
            .lock()
            .map(|inner| {
                inner.active
                    && inner.generation == grant.generation
                    && self.owner_id == grant.owner_id
            })
            .unwrap_or(false)
    }
}

#[cfg(test)]
#[path = "fusion_access_tests.rs"]
mod tests;
