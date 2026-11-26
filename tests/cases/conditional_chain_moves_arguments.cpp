void f() {
    for (int i = 0; i < 10; ++i) {
        for (int j = 0; j < 10; ++j) {
            if (true) {
                const auto num_in = outpoint_to_rbf ? 2 :
                    last_tx ? fuzzed_data_provider.ConsumeIntegralInRange<int>(package_outpoints.size()/2 + 1, package_outpoints.size()) :
                    fuzzed_data_provider.ConsumeIntegralInRange<int>(1, 4);
            }
        }
    }
}
