class PartialReformat {
    void check() {
        run(); // a trailing comment long enough that the formatter wraps it onto a second line, which is
        String expected = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>W3c</title></head><body></body></html>";
        int next = 2;
    }
}
