void f() {
    MaxPoolFunc func =
        inptype == CV_32F ? maxPool32f :
        inptype == CV_8S  ? maxPool8s :
        inptype == CV_64F ? /*first
        second*/ someVeryLongFunctionName(argumentNumberOne, argumentNumberTwo, argumentNumberThree, four) :
        nullptr;
}
