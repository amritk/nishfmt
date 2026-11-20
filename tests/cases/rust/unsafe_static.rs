unsafe extern "C" {
    pub safe static mut COUNTER: i32;

    pub  unsafe  static IMPORTANT_BYTES: [u8; 256];
    unsafe static mut X : u8;
}
unsafe static X: u8 = 1;
fn f() { unsafe static X: u8 = 1; }
