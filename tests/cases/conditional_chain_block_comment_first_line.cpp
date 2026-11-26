struct S {
  void runOp(const Mat &inp, Mat &out, const ConvState &cs) {
        MaxPoolFunc func =
            inptype == CV_32F ? maxPool32f :
            inptype == CV_8S  ? maxPool8s :
            inptype == CV_8U  ? maxPool8u :
            inptype == CV_64F ? maxPool64f :
            /*inptype == CV_16F ? maxPool16f :
            inptype == CV_16BF ? maxPool16bf :*/
            nullptr;
  }
};
