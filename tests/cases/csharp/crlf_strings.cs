namespace Demo
{
    class Strings
    {
        string a = @"verbatim
   keeps its lines
";
        string b = """
            raw string
              indented line

            """;
        string c = $@"interpolated {a}
verbatim {b}";
        string c2 = @$"other order
  {a}";
        string d = $"""
            interpolated {a} raw
              second {b}
            """;
        string e = $$"""
            {{a}} two dollars
            """;
        string f = $"interp {a
            + b} spans lines";
        string g = """
    raw string
    """;
        void M()
        {
            Call(@"x
y", """
                arg
                """);
        }
    }
}
