// Type arguments after a null assertion apply to the call that follows
// (flutter's app.dart).
f(widget, settings, b) => widget.pageRouteBuilder!<dynamic>(settings,  b);
g(a) => a!<int>(1) + a[0]!<int>(2) + a(0)!<String>() + a..b!<int>(3);
h(a) => a!<int>;
