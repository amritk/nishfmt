// `static` is a closure only before `move`, `use`, `|` or `||`; `static async`
// starts a static item, and `async` is no identifier (parse_global_static_front_matter).
fn f() {
    static async || {};
}
fn  g( ) {}
