void f() {
    const int channelstoread = ( multispectral ? img.channels() : (m_iscolor && alphasupported) ? 4 :
                                ( (m_iscolor && !m_ischroma) || color) ? 3 : alphasupported ? 2 : 1 ); // number of channels to read may exceed channels in output img
}
