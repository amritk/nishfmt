#define FB_LOG(logger, level, filename, linenumber, functionName, FORMAT, fmt, arg1, ...) \
  FB_LOG_RAW_IMPL(logger, level, filename, linenumber, functionName, ::folly::LogStreamProcessor::FORMAT, fmt, arg1, ##__VA_ARGS__)
