const T kValues[] = {
    std::numeric_limits<T>::max(),
    std::numeric_limits<T>::epsilon(),
    std::nextafter(std::numeric_limits<T>::min(),
                   T(1)), // min + epsilon
    std::numeric_limits<T>::min(),        // smallest normal
};
