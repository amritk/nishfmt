void f() {
  {
    {
            if ((all_const || fold_shape) /*&&
                op->supportBlockLayout(0, (int)ninputs) <= 0 // we don't currently support constant folding
                                               // for block-layout operations (Convolution, MaxPool, AveragePool)
                */) {
                x();
            }
    }
  }
}
