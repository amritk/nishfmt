namespace Demo
{
    /// <summary>
    /// Docs on a class,
    /// over lines.    /// </summary>
    class Mixed
    {
        #region Fields
        /* block
           comment
           with a CR           end */
        private   int   x = 1;        string v = @"a
b
cd";
        string r = """
            one
            two            """;
        string i = $@"{x}
{x}
{x}z";
        string ir = $"""
            {x}
            {x}            """;
        #endregion

        // csharpier-ignore
        private   int   ignored   =   1;
        // csharpier-ignore-start
        private   int   a   =   2;
        private   int   b   =   3;        private   int   c   =   4;
        // csharpier-ignore-end

        void M()
        {
#if DEBUG
            Console.WriteLine("debug");
#elif NEVER
            int   q  =  1;
            q   = 2;
            q=3;#else
            Console.WriteLine("release");
#endif            int[] xs = { 1,
 2, 3 };
#if false
   never   parsed (
  at all     ok
#endif
            var s = $"{x
 + 1} and {x
 + 2}";
        }

        // csharpier-ignore
        void N()   {
   var  y =  1;
  var z = 2;  }
    }
}
