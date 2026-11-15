#!/usr/bin/env python3
"""Translate the racc reduce actions of the parser gem's ruby33.rb into the
methods of RbParser, spliced into parser_tmpl.ts.

    python3 genparser.py <parser gem>/lib/parser/ruby33.rb ../../src/ruby/parser.ts

The actions are a small subset of Ruby: builder calls, array literals with
splats, destructuring assignments, if/else, and calls on the parser's stacks.
Every value is an RbAst handle; booleans the grammar keeps (context flags) are
scalar handles. A few actions whose Ruby has no direct counterpart are written
by hand in OVERRIDES.
"""

import re
import sys

# ---- Hand-written actions ---------------------------------------------------------

OVERRIDES = {
    # call_op: tDOT / tANDDOT. The parser gem keeps [:dot, range]; a token whose
    # value is "." or "&." reads the same to the builder (call_type_for_dot).
    726: "return this.a.token(\".\", this.a.tokS(v[0]), this.a.tokE(v[0]));",
    727: "return this.a.token(\"&.\", this.a.tokS(v[0]), this.a.tokE(v[0]));",
    # mlhs_node: primary_value call_op tIDENTIFIER (and tCONSTANT)
    110: "if (this.a.tokValue(v[1]) === \"&.\") {\n  return this.fail();\n}\nreturn this.b.attrAsgn(v[0], v[1], v[2]);",
    112: "if (this.a.tokValue(v[1]) === \"&.\") {\n  return this.fail();\n}\nreturn this.b.attrAsgn(v[0], v[1], v[2]);",
    # numeric: tUNARY_NUM simple_numeric (Builders::Default has no negate).
    # Prism, which RuboCop parses 3.3 with, reads a sign followed by a space
    # as the unary method: `- 1` is (send (int 1) :-@).
    607: "if (this.a.tokE(v[0]) !== this.a.exS(v[1])) {\n  return this.b.unaryOp(v[0], v[1]);\n}\nreturn this.b.unaryNum(v[0], v[1]);",
    # p_kw_label: tLABEL / tSTRING_BEG string_contents tLABEL_END
    520: "return this.a.list2(this.a.scalar(1), v[0]);",
}

# Ruby builder method -> RbBuilder method, and leading arguments the TS takes.
BUILDER_NAMES = {
    "true": "true_",
    "false": "false_",
    "self": "self_",
    "case": "case_",
    "for": "for_",
    "const": "const_",
    "integer": "numeric(NT_INT, ",
    "float": "numeric(NT_FLOAT, ",
    "rational": "numeric(NT_RATIONAL, ",
    "complex": "numeric(NT_COMPLEX, ",
}

CTX_BITS = {
    "in_defined": 1,
    "in_kwarg": 2,
    "in_argdef": 4,
    "in_def": 8,
    "in_class": 16,
    "in_block": 32,
    "in_lambda": 64,
    "cant_return": 128,
}


RENAME = {"const": "const_", "string": "string_"}


def camel(n):
    if n.startswith("__"):
        return n
    p = n.split("_")
    return p[0] + "".join(x[:1].upper() + x[1:] for x in p[1:])


# ---- Lexing the Ruby ----------------------------------------------------------------

TOKEN_RE = re.compile(
    r"""\s*(?:
      (?P<num>\d+)
    | (?P<str>'[^']*')
    | (?P<sym>:[A-Za-z_]\w*[?!]?)
    | (?P<ivar>@\w+)
    | (?P<id>[A-Za-z_]\w*[?!]?)
    | (?P<op>==|!=|&&|\|\||<<|=>|[\[\](){},.=!?:*])
    )""",
    re.X,
)


def lex(s):
    out = []
    i = 0
    while i < len(s):
        if s[i:].strip() == "":
            break
        m = TOKEN_RE.match(s, i)
        if not m:
            raise SyntaxError(f"cannot lex {s[i:]!r} in {s!r}")
        kind = m.lastgroup
        val = m.group(kind)
        if kind == "id" and val in RENAME and not (out and out[-1][1] == "."):
            val = RENAME[val]
        out.append((kind, val))
        i = m.end()
    out.append(("eof", ""))
    return out


# ---- Expressions ----------------------------------------------------------------------


class E:
    """A translated expression: TS code and its type (h handle, b bool, s string, i int, v void)."""

    def __init__(self, code, ty, idx=None):
        self.code = code
        self.ty = ty
        self.idx = idx  # (base E, k) for `x[k]`, whose meaning depends on the reader

    def h(self):
        if self.idx is not None:
            base, k = self.idx
            return f"this.a.at({base.h()}, {k})"
        if self.ty == "h":
            return self.code
        if self.ty == "b":
            return f"this.hb({self.code})"
        raise TypeError(f"not a handle: {self.code} ({self.ty})")

    def b(self):
        if self.ty == "b":
            return self.code
        return f"this.truthy({self.h()})"

    def s(self):
        if self.idx is not None:
            base, k = self.idx
            assert k == 0
            return f"this.a.tokValue({base.h()})"
        if self.ty == "s":
            return self.code
        raise TypeError(f"not a string: {self.code}")


class Translator:
    def __init__(self, n):
        self.n = n
        self.locals = {}  # name -> type

    # -- token stream
    def parse_expr(self, s):
        self.toks = lex(s)
        self.pos = 0
        e = self.expr()
        if self.peek()[0] != "eof":
            raise SyntaxError(f"trailing {self.toks[self.pos:]} in {s!r}")
        return e

    def peek(self, k=0):
        return self.toks[self.pos + k]

    def take(self, v=None):
        t = self.toks[self.pos]
        if v is not None and t[1] != v:
            raise SyntaxError(f"expected {v!r}, got {t} at {self.toks}")
        self.pos += 1
        return t

    def at(self, v):
        return self.peek()[1] == v and self.peek()[0] in ("op", "id")

    # -- grammar
    def expr(self):
        c = self.or_()
        if self.at("?"):
            self.take("?")
            a = self.expr()
            self.take(":")
            b = self.expr()
            if a.ty == "b" and b.ty == "b":
                return E(f"({c.b()} ? {a.code} : {b.code})", "b")
            return E(f"({c.b()} ? {a.h()} : {b.h()})", "h")
        return c

    def or_(self):
        a = self.and_()
        while self.at("||"):
            self.take()
            b = self.and_()
            a = E(f"({a.b()} || {b.b()})", "b")
        return a

    def and_(self):
        a = self.not_()
        while self.at("&&"):
            self.take()
            b = self.not_()
            a = E(f"({a.b()} && {b.b()})", "b")
        return a

    def not_(self):
        if self.at("!"):
            self.take()
            a = self.not_()
            return E(f"!{a.b()}", "b")
        return self.cmp()

    def cmp(self):
        a = self.shift()
        if self.at("==") or self.at("!="):
            op = self.take()[1]
            b = self.shift()
            if a.ty in ("i", "n"):
                return E(f"({a.code} {op}= {b.code})", "b")
            raise SyntaxError(f"compare {a.code} {b.code}")
        return a

    def shift(self):
        a = self.postfix()
        while self.at("<<"):
            self.take()
            b = self.postfix()
            a = E(f"this.a.push({a.h()}, {b.h()})", "h")
        return a

    def args(self):
        """( a, *b, c ) -> list of (splat, E)."""
        self.take("(")
        out = []
        while not self.at(")"):
            splat = False
            if self.at("*"):
                self.take()
                splat = True
            out.append((splat, self.expr()))
            if self.at(","):
                self.take()
        self.take(")")
        return out

    def postfix(self):
        a = self.primary()
        while True:
            if self.at("["):
                self.take("[")
                k = int(self.take()[1])
                self.take("]")
                a = E(None, "x", (a, k))
            elif self.at("."):
                self.take(".")
                name = self.take()[1]
                a = self.method(a, name)
            else:
                return a

    def method(self, recv, name):
        if name == "concat":
            (_, b), = self.args()
            return E(f"this.a.append({recv.h()}, {b.h()})", "h")
        if name == "push":
            (_, b), = self.args()
            return E(f"this.a.push({recv.h()}, {b.h()})", "h")
        if name == "empty?":
            return E(f"(this.a.len({recv.h()}) === 0)", "b")
        if name == "any?":
            return E(f"(this.a.len({recv.h()}) > 0)", "b")
        if name == "nil?":
            return E(f"({recv.h()} === V_NIL)", "b")
        if name == "size":
            return E(f"this.a.len({recv.h()})", "n")
        if name in CTX_BITS:
            return E(f"this.cb({recv.h()}, {CTX_BITS[name]})", "b")
        raise SyntaxError(f"method {name} on {recv.code}")

    def builder_call(self, name):
        args = self.args() if self.at("(") else []
        arity = BUILDER_ARITY[BUILDER_NAMES.get(name, camel(name)).split("(")[0]]
        lead = ""
        tsname = BUILDER_NAMES.get(name, camel(name))
        if tsname.endswith(", "):
            lead = tsname[tsname.index("(") + 1 :]
            tsname = tsname[: tsname.index("(")]
            arity -= 1
        # Symbol arguments name node types.
        parts = []
        nsplat = sum(1 for s, _ in args if s)
        fixed = len(args) - nsplat
        for i, (splat, e) in enumerate(args):
            if e.ty == "sym":
                sym = e.code[1:]
                if name == "loop_mod":
                    parts.append(f"NT_{sym.upper()}, NT_{sym.upper()}_POST")
                else:
                    parts.append("NT_" + sym.upper().replace("?", "_P"))
                continue
            if splat:
                k = arity - fixed - (1 if name == "loop_mod" else 0)
                assert nsplat == 1 and k > 0, (self.n, name, arity, fixed)
                base = e.h()
                for j in range(k):
                    parts.append(f"this.a.at({base}, {j})")
                continue
            parts.append(e.code if e.ty == "n" else e.h())
        return E(f"this.b.{tsname}({lead}{', '.join(parts)})", "h")

    def array(self):
        self.take("[")
        items = []
        while not self.at("]"):
            splat = False
            if self.at("*"):
                self.take()
                splat = True
            items.append((splat, self.expr()))
            if self.at(","):
                self.take()
        self.take("]")
        if not items:
            return E("this.a.list()", "h")
        hs = []
        mask = 0
        for i, (splat, e) in enumerate(items):
            if e.ty == "sym":
                hs.append({":dot": "this.a.scalar(0)", ":label": "this.a.scalar(1)", ":quoted": "this.a.scalar(2)"}[e.code])
            else:
                hs.append(e.h())
            if splat:
                mask |= 1 << i
        return E(f"this.ls([{', '.join(hs)}], {mask})", "h")

    def primary(self):
        kind, t = self.peek()
        if t == "(" and kind == "op":
            self.take()
            e = self.expr()
            self.take(")")
            return e
        if t == "[" and kind == "op":
            return self.array()
        if kind == "num":
            self.take()
            return E(t, "n")
        if kind == "sym":
            self.take()
            if t.startswith(":t"):
                return E(f"TK_{t[1:]}", "i")
            return E(t[1:], "sym") if False else E(t, "sym")
        self.take()
        if t == "val":
            return E("this.ls(v, 0)", "h") if not self.at("[") else self.val_index()
        if t == "nil":
            return E("V_NIL", "h")
        if t == "true":
            return E("true", "b")
        if t == "false":
            return E("false", "b")
        if t in ("@builder",):
            self.take(".")
            name = self.take()[1]
            return self.builder_call(name)
        if t in ("@context", "context"):
            self.take(".")
            name = self.take()[1]
            if name == "dup":
                return E("this.a.scalar(this.ctx.bits())", "h")
            if name == "in_dynamic_block?":
                return E("this.ctx.inDynamicBlock()", "b")
            return E(f"this.ctx.{name}", "b")
        if t in ("@static_env", "static_env"):
            self.take(".")
            name = self.take()[1]
            if name == "declared?":
                (_, a), = self.args()
                return E(f"this.env.declared({a.s()})", "b")
            return E(f"this.{camel(name.replace('?', '_p'))}()", "b")
        if t in ("@max_numparam_stack", "max_numparam_stack"):
            self.take(".")
            name = self.take()[1]
            if name == "push":
                self.take("(")
                self.take()  # static:
                self.take(":")
                b = self.take()[1]
                self.take(")")
                return E(f"this.st.npPush({b})", "v")
            m = {
                "pop": ("this.st.npPop()", "n"),
                "top": ("this.st.npTop()", "n"),
                "has_ordinary_params!": ("this.st.setOrdinaryParams()", "v"),
                "has_numparams?": ("this.st.hasNumparams()", "b"),
            }[name]
            return E(*m)
        if t == "@current_arg_stack":
            self.take(".")
            name = self.take()[1]
            if name == "pop":
                return E("this.st.argPop()", "v")
            (_, a), = self.args()
            if a.code == "V_NIL":
                arg = '""'
            elif a.code == "0":
                arg = '""'  # set(0): no current argument
            else:
                arg = a.s()
            return E(f"this.st.arg{'Push' if name == 'push' else 'Set'}({arg})", "v")
        if t in ("@pattern_variables", "@pattern_hash_keys"):
            self.take(".")
            name = self.take()[1]
            keys = "true" if t == "@pattern_hash_keys" else "false"
            return E(f"this.st.vars{name.capitalize()}({keys})", "v")
        if t == "@lexer":
            self.take(".")
            name = self.take()[1]
            if name in ("cmdarg", "cond"):
                self.take(".")
                op = self.take()[1]
                if op == "push":
                    (_, a), = self.args()
                    return E(f"this.lx.{name}.push({a.b()})", "b")
                return E(f"this.lx.{name}.pop()", "b")
            if name == "dedent_level":
                return E("this.lx.dedent_level()", "n")
            raise SyntaxError(f"@lexer.{name}")
        if t == "@last_token":
            self.take("[")
            self.take()
            self.take("]")
            return E("this.lastTok", "i")
        if t == "local_push":
            return E("this.localPush()", "v")
        if t == "local_pop":
            return E("this.localPop()", "v")
        if t == "yyerrok":
            return E("V_NIL", "v")
        if t in ("endless_method_name", "check_kwarg_name"):
            (_, a), = self.args()
            return E(f"this.{camel(t)}({a.h()})", "v")
        if t == "result":
            return E("result", "h")
        if t in self.locals:
            ty = self.locals[t]
            return E(t, ty)
        raise SyntaxError(f"unknown name {t!r} in action {self.n}")

    def val_index(self):
        self.take("[")
        k = int(self.take()[1])
        self.take("]")
        return E(f"v[{k}]", "h")


def read_builder_arity(path):
    src = open(path).read()
    out = {}
    for m in re.finditer(r"^  (\w+)\(([^)]*)\): i32 \{", src, re.M):
        params = [p for p in m.group(2).split(",") if p.strip()]
        out[m.group(1)] = len(params)
    return out


BUILDER_ARITY = {}


# ---- Statements ---------------------------------------------------------------------


def join_lines(body):
    lines = []
    for raw in body.split("\n"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = re.sub(r"\s+#[^'\n]*$", "", line)
        if lines and (lines[-1].endswith((",", "(", "&&", "||", "[", ".")) or line.startswith(".") or depth(lines[-1]) > 0):
            lines[-1] = lines[-1] + " " + line
        else:
            lines.append(line)
    return lines


def depth(s):
    d = 0
    q = False
    for c in s:
        if c == "'":
            q = not q
        elif not q and c in "([{":
            d += 1
        elif not q and c in ")]}":
            d -= 1
    return d


def split_targets(lhs):
    """`a, (b, c)` / `*a, (b, c)` -> nested lists of names."""
    out = []
    cur = ""
    d = 0
    for c in lhs + ",":
        if c == "(":
            d += 1
        if c == ")":
            d -= 1
        if c == "," and d == 0:
            cur = cur.strip()
            if cur.startswith("("):
                out.append(split_targets(cur[1:-1]))
            else:
                out.append(cur)
            cur = ""
        else:
            cur += c
    return out


def translate(n, body):
    tr = Translator(n)
    out = []
    ind = [""]
    tmp = [0]
    returned = [False]

    def emit(s):
        out.append(ind[0] + s)

    def declare(name, ty):
        if name not in tr.locals:
            tr.locals[name] = ty

    def destructure(targets, src):
        """Assign handle `src` (code) to nested targets."""
        splat_first = isinstance(targets[0], str) and targets[0].startswith("*")
        for i, t in enumerate(targets):
            if splat_first and i == 0:
                name = t[1:]
                declare(name, "h")
                emit(f"{name} = this.a.slice({src}, 0, this.a.len({src}) - {len(targets) - 1});")
                continue
            idx = -(len(targets) - i) if splat_first else i
            if isinstance(t, list):
                tmp[0] += 1
                nm = f"t{tmp[0]}"
                declare(nm, "h")
                emit(f"{nm} = this.a.at({src}, {idx});")
                destructure(t, nm)
            else:
                declare(t, "h")
                emit(f"{t} = this.a.at({src}, {idx});")

    for line in join_lines(body):
        if line.startswith("diagnostic "):
            level = line.split()[1].rstrip(",")
            if level == ":error":
                emit("return this.fail();")
                if ind[0] == "":
                    returned[0] = True
            continue
        m = re.match(r"^(if|unless|elsif) (.*)$", line)
        if m:
            kw, cond = m.groups()
            if cond.startswith("@builder.respond_to?"):
                raise SyntaxError("respond_to")
            c = tr.parse_expr(cond).b()
            if kw == "unless":
                c = f"!({c})"
            if kw == "elsif":
                ind[0] = ind[0][:-2]
                emit(f"}} else if ({c}) {{")
            else:
                emit(f"if ({c}) {{")
            ind[0] += "  "
            continue
        if line == "else":
            ind[0] = ind[0][:-2]
            emit("} else {")
            ind[0] += "  "
            continue
        if line == "end":
            ind[0] = ind[0][:-2]
            emit("}")
            continue
        m = re.match(r"^@static_env\.declare (.*)$", line)
        if m:
            emit(f"this.env.declare({tr.parse_expr(m.group(1)).s()});")
            continue
        m = re.match(r"^@lexer\.state = :(\w+)$", line)
        if m:
            emit(f"this.lx.setState(RL_LEX_EN_{m.group(1).upper()});")
            continue
        m = re.match(r"^@lexer\.command_start = (\w+)$", line)
        if m:
            emit(f"this.lx.command_start = {m.group(1)};")
            continue
        m = re.match(r"^@context\.(\w+) = (.*)$", line)
        if m:
            emit(f"this.ctx.{m.group(1)} = {tr.parse_expr(m.group(2)).b()};")
            continue
        m = re.match(r"^(\*?[\w]+\s*,.*?|\(.*?)\s*=\s*\*?(val\[\d+\]|val)$", line)
        if m and not line.startswith("result ="):
            targets = split_targets(m.group(1))
            src = tr.parse_expr(m.group(2)).h()
            destructure(targets, src)
            continue
        m = re.match(r"^(\w+)\s*=\s*(.*)$", line)
        if m and m.group(2)[:1] != "=":
            name, rhs = m.groups()
            if name == "name" and re.fullmatch(r"val\[\d+\]\[0\]", rhs.strip()):
                declare(name, "s")
                emit(f"{name} = {tr.parse_expr(rhs).s()};")
                continue
            e = tr.parse_expr(rhs)
            if name == "result":
                emit(f"result = {e.h()};")
                continue
            name = RENAME.get(name, name)
            ty = {"x": "h"}.get(e.ty, e.ty)
            declare(name, ty)
            if ty == "h":
                emit(f"{name} = {e.h()};")
            else:
                emit(f"{name} = {e.code};")
            continue
        e = tr.parse_expr(line)
        emit((e.code if e.idx is None else e.h()) + ";")
    return tr, out, returned[0]


def main():
    rb = open(sys.argv[1]).read()
    out_path = sys.argv[2]
    here = __file__.rsplit("/", 1)[0]
    BUILDER_ARITY.update(read_builder_arity(f"{here}/../../src/ruby/builder.ts"))
    acts = {}
    for m in re.finditer(r"def _reduce_(\d+)\(val, _values, result\)\n(.*?)\n    result\nend", rb, re.S):
        acts[int(m.group(1))] = m.group(2)
    methods = []
    cases = []
    for n in sorted(acts):
        if n in OVERRIDES:
            body = OVERRIDES[n].split("\n")
        else:
            tr, lines, _ = translate(n, acts[n])
            # Code after a top-level diagnostic :error is unreachable.
            for i, l in enumerate(lines):
                if l == "return this.fail();":
                    lines = lines[: i + 1]
                    break
            decl = []
            for name, ty in tr.locals.items():
                tsty = {"h": "i32", "b": "boolean", "s": "string", "i": "i32", "n": "i32"}[ty]
                init = {"h": "V_NIL", "b": "false", "s": '""', "i": "0", "n": "0"}[ty]
                decl.append(f"let {name}: {tsty} = {init};")
            refs = [l for l in lines if re.search(r"\bresult\b", l)]
            ends = lines and lines[-1] == "return this.fail();"
            if ends:
                body = decl + lines
            elif lines and lines[-1].startswith("result = ") and len(refs) == 1:
                body = decl + lines[:-1] + ["return " + lines[-1][len("result = "):]]
            elif refs:
                body = ["let result = v.length > 0 ? v[0] : V_NIL;"] + decl + lines + ["return result;"]
            else:
                body = decl + lines + ["return v.length > 0 ? v[0] : V_NIL;"]
        methods.append(f"  r{n}(v: i32[]): i32 {{\n" + "\n".join("    " + l for l in body) + "\n  }\n")
        cases.append(f"      case {n}:\n        return this.r{n}(v);")
    tmpl = open(f"{here}/parser_tmpl.ts").read()
    tmpl = tmpl.replace("  // @ACTIONS@\n", "\n".join(methods))
    tmpl = tmpl.replace("      // @CASES@\n", "\n".join(cases) + "\n")
    open(out_path, "w").write(tmpl)


if __name__ == "__main__":
    main()
