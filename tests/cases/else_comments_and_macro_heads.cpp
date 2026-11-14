void f() {
  if (a) {
    x();
  }
  // Shift Down Selection.
  else if (b) {
    y();
  } else if (c) {
    z();
  }
  if (a)
    x();
  // c
  else
    y();
  if (q) // trailing
  {
    r();
  } else {
    s();
  }
}
#define PASS11(m_name, m_type1, m_type2, m_type3, m_type4, m_type5, m_type6, m_type7, m_type8, m_type9, m_type10,      \
               m_type11)                                                                                               \
  void m_name(m_type1 arg1, m_type2 arg2, m_type3 arg3, m_type4 arg4, m_type5 arg5, m_type6 arg6, m_type7 arg7,        \
              m_type8 arg8, m_type9 arg9, m_type10 arg10, m_type11 arg11) {                                            \
    PASSBASE->m_name(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11);                              \
  }
