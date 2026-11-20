void f() {
  if (const Chainstate * cs{chainman.HistoricalChainstate()}) {
    g(cs);
  }
  if (const HTTPRequest * cur{client->GetRequest()}; cur && cur->GetState() == State::Error) {
    g(cur);
  }
  while (const Node * n{next()}) {
    g(n);
  }
  if (a * b) {
    g();
  }
}
void g() {
  if (const char *const *tag{std::any_cast<const char *>(&arg)}; tag && std::string_view{*tag} == "build") {
  }
  if (const A a; tag * x) {
  }
}
