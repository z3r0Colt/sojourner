//! The one piece of Tauri the generated command files use: `State<T>`, here
//! a plain reference to the worker's own value. `db.conn()` in a command body
//! reaches `DbState::conn` through `Deref`, as it does on the desktop.

pub struct State<'r, T: ?Sized>(pub &'r T);

impl<T: ?Sized> State<'_, T> {
    pub fn inner(&self) -> &T {
        self.0
    }
}

impl<T: ?Sized> std::ops::Deref for State<'_, T> {
    type Target = T;
    fn deref(&self) -> &T {
        self.0
    }
}
