std::string translate() {
    try {
        return tryTranslators(m_translators);
    }
    // To avoid having to handle TFE explicitly everywhere, we just
    // rethrow it so that it goes back up the caller.
    catch( TestFailureException& ) {
        return "{ nested assertion failed }";
    }
    catch( std::exception const& ex ) {
        return ex.what();
    }
    // A comment before a later catch too.
    catch( std::string const& msg ) {
        return msg;
    }
    catch(...) {
        return "Unknown exception";
    }
}
void g() {
  try {
    f();
  } // trailing
  catch (...) {
  }
}
