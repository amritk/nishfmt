@class Mat;

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, GPBErrorCode) {
  /** The size does not fit. */
  GPBErrorInvalidSize = -100,
  GPBErrorInvalidTag = -103, // Tag
};

@protocol CvVideoCameraDelegate2 <NSObject>
@optional
-(void)processImage:(Mat*)image;
@end

__attribute__((objc_subclassing_restricted))
@interface GPBUnknownFields : NSObject<NSCopying, NSFastEnumeration>
@end

@interface GPBMessage() {
 @package
  GPBMessage_StoragePtr messageStorage_;
}
@property(nonatomic, readonly, getter = isInitialized) BOOL initialized;
@property(readonly) cv::Vec2d& nativeRef;
+(instancetype)fromNative:(cv::Vec2d&)vec2d;
-(void)set:(NSArray<NSNumber*>*)vals NS_SWIFT_NAME(set(vals:));
- (instancetype)initWithX:(float)x y:(float)y size:(float)size angle:(float)angle response:(float)response octave:(int)octave classId:(int)classId;
- (int)checkVector:(int)elemChannels depth:(int)depth requireContinuous:(BOOL)requireContinuous NS_SWIFT_NAME(checkVector(elemChannels:depth:requireContinuous:));
@end

@interface GPBUnknownFields (AccessHelpers)
- (BOOL)getFirst:(int32_t)fieldNumber varint:(nonnull uint64_t *)outValue;
@end

static inline NSData *DataFromCStr(const char *str) {
  return [NSData dataWithBytes:str length:strlen(str)];
}

NS_ASSUME_NONNULL_END
