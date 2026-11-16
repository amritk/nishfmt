fn main() {
    info!(
        ?secret_message,
        "Here's a log that uses the debug sigil"
    );
    arg!(-o --opt <opt> "some option");
    arg!([arg] ... "some arg");
    write!(
        message,
        "{}",
        if let Some(x) = env::var_os("X")
            && let Ok(y) = x.into_string()
        {
            y
        } else {
            "".to_owned()
        }
    );
    printdoc! {r#"
        Exits with failure
    "#};
    pats.push(if self.fixed_strings { format!("(?:{})", pcre2::escape(p.as_ref())) } else { format!("(?:{})", p.as_ref()) });
}
