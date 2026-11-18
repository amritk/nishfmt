import java.util.List;


/** The entry point. */
void main() { System.out.println(greeting(List.of("a", "b"))); }
// A field.
String prefix = "hello ";;
class Helper { int a; }
static String greeting(List<String> names) { return prefix + String.join(", ", names); }
