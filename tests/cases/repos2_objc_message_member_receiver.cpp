void f(NSWindow *ns_window) {
  id metal_layer = [CAMetalLayer layer];
  [ns_window.contentView setWantsLayer : YES] ;
  [ns_window.contentView setLayer : metal_layer] ;
  [self->window.contentView setFrame : rect display : YES];
}
