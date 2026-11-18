class HugLambdaComment {
  void f() {
    runInTransaction(() -> {
      // A comment inside the hugged lambda that is long enough to need wrapping at the new indent level of the body.
      save(entity); /* trailing block comment */
    });
    callback.accept(value -> // a line comment after the arrow keeps the lambda from hugging
        process(value));
  }
}
