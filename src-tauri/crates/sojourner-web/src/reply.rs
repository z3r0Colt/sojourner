//! A command's answer as the page receives it: `Ok` with the JSON value of
//! what it returned, or `Err` with the JSON value of its error -- for
//! `AppResult` a string, which `invoke()` throws, as Tauri's IPC does.

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

pub type Reply = Result<Value, Value>;

fn to_json(v: impl Serialize) -> Reply {
    serde_json::to_value(v).map_err(|e| Value::String(format!("the answer could not be sent: {e}")))
}

pub fn result<T: Serialize, E: Serialize>(r: Result<T, E>) -> Reply {
    match r {
        Ok(v) => to_json(v),
        Err(e) => Err(to_json(e)?),
    }
}

pub fn value<T: Serialize>(v: T) -> Reply {
    to_json(v)
}

pub fn unit(_: ()) -> Reply {
    Ok(Value::Null)
}

/// A command's arguments, from the object the page sent. `null` or nothing
/// at all is an empty object, so a command without arguments reads fine.
pub fn args<T: DeserializeOwned>(cmd: &str, args: Value) -> Result<T, Value> {
    let args = if args.is_null() { Value::Object(Default::default()) } else { args };
    serde_json::from_value(args).map_err(|e| Value::String(format!("invalid args for command `{cmd}`: {e}")))
}

/// The error for a command the web build does not have.
pub fn unavailable(cmd: &str) -> Value {
    Value::String(format!("Not available in Sojourner on the web: {cmd}"))
}
