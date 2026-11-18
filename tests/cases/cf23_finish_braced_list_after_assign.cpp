static const std::unordered_map<std::string, BlockBasedTableOptions::IndexMode> block_base_table_index_mode_string_map =
    { // NOLINT(cert-err58-cpp)
        {"kStandardOnly", BlockBasedTableOptions::IndexMode::kStandardOnly},
        {"kStandardDefault", BlockBasedTableOptions::IndexMode::kStandardDefault}};
PROTOBUF_THREAD_LOCAL SamplingState global_sampling_state = {
    /*next_sample=*/0, /*sample_stride=*/0};
