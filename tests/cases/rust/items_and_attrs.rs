mod self_;
mod r#type;
mod relative_to;
mod parse;

#[case::long(
	r#"$in | detect columns | get data | any {|line| ($line | str contains "+") and ($line | str contains "-")}"#,
	true
)]
fn f(#[case] code: &str) {}

pub fn get() -> Option<String> {
    std::env::var(LOCALE_OVERRIDE_ENV_VAR).ok().or_else(
        #[cfg(not(test))]
        {
            system_locale_from_os
        },
        #[cfg(test)]
        {
            || Some(String::from("en-US"))
        },
    )
}

impl<T: Q> C for T {
    fn a<R>(self) -> X<S, R>
    where
        R: Q<T = <S::Q as Q>::T>,
    {
        1
    }
    fn b<R>(self) -> X<S, R>
    where
        R: Q<T = <S::Q as Q>::T>,
    {
        1
    }
}
