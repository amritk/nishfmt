enum Flags {
  HB_OT_LAYOUT_GLYPH_PROPS_PRESERVE = HB_OT_LAYOUT_GLYPH_PROPS_SUBSTITUTED | HB_OT_LAYOUT_GLYPH_PROPS_LIGATED | HB_OT_LAYOUT_GLYPH_PROPS_MULTIPLIED
};
enum CalibFlags {
  CALIB_FIX_A = (1 << 23), //!< For fisheye model only. Recompute board position on each calibration iteration
  CALIB_CHECK_COND = (1 << 24), //!< For fisheye model only. Check SVD decomposition quality for each frame during extrinsics estimation
  USAGE_ALLOCATE_SHARED_MEMORY = 1 << 2, // It is not equal to: USAGE_ALLOCATE_HOST_MEMORY | USAGE_ALLOCATE_DEVICE_MEMORY xxxxxxx
};
