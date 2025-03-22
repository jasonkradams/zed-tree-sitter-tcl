/**
 * @file Tcl grammar for tree-sitter
 * @author Jason Adams <jason.k.r.adams@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Taken from the expr man page
const PREC = {
  after_delay: 160, // Prioritize "after ms"
  unary: 150, // - + ~ !
  exp: 140, // **
  muldiv: 130, // * / %
  addsub: 120, // + -
  shift: 110, // << >>
  compare: 100, // > < >= <=
  equal_bool: 90, // == !=
  equal_string: 80, // eq ne
  contain: 70, // in ni
  and_bit: 60, // &
  xor_bit: 50, // ^
  or_bit: 40, // |
  and_logical: 30, // &&
  or_logical: 20, // ||
  ternary: 10, // x ? y : z
};

const interleaved1 = (rule, delim) => seq(rule, repeat(seq(delim, rule)));

module.exports = grammar({
  name: "tcl",

  word: ($) => $.simple_word,

  externals: ($) => [$._concat, $._immediate],

  inline: ($) => [$._builtin, $._terminator, $._word],

  extras: ($) => [/\s+/, /\\\r?\n/, $.end_of_line_comment],

  conflicts: ($) => [
    [$.after], // Existing conflict resolution for `after`
    [$.while, $.expr], // Resolves conflict between `while` and `expr`
    [$._expr_atom_no_brace, $._expr],
  ],

  rules: {
    source_file: ($) =>
      repeat(seq(optional(choice($.comment, $._command)), $._terminator)),

    _terminator: (_) => choice("\n", ";"),

    comment: (_) => /#[^\n]*/,
    end_of_line_comment: (_) => /;(\s+)?#[^\n]*/,

    // ------------------------------------------------------------------------
    // Builtin Commands
    // ------------------------------------------------------------------------

    _builtin: ($) =>
      choice(
        $.after,
        $.append,
        $.catch,
        $.conditional,
        $.expr_cmd,
        $.foreach,
        $.global,
        $.namespace,
        $.package,
        $.procedure,
        $.regexp,
        $.regsub,
        $.set,
        $.try,
        $.while,
      ),

    after: ($) =>
      choice(
        prec(
          PREC.after_delay,
          seq("after", $._number, optional($._word)), // after ms { return }
        ),
        seq("after", "chancel", choice($.simple_word, repeat($.simple_word))), // after cancel id/script
        seq("after", "idle", repeat($.simple_word)), // after idle scripts
        seq("after", "info", optional($.simple_word)), // after info ?id?
      ),

    append: ($) =>
      prec.left(
        seq(
          "append",
          field("variable", $.simple_word), // Variable name
          repeat(
            field(
              "value",
              choice(
                $.simple_word,
                $.variable_substitution,
                $.quoted_word,
                $.braced_word,
                $.command_substitution,
              ),
            ),
          ),
        ),
      ),

    package: ($) =>
      prec.left(
        seq(
          "package",
          choice(
            "forget",
            "ifneeded",
            "names",
            "present",
            "provide",
            "require",
            "unknown",
            "vcompare",
            "versions",
            "vsatisfies",
          ),
          optional(
            seq(optional("-exact"), $.simple_word, optional($.simple_word)),
          ),
        ),
      ),

    // regexp ?switches? exp string ?matchVar? ?subMatchVar subMatchVar ...?
    regexp: ($) =>
      prec.left(
        seq(
          "regexp",
          $._word_simple, // exp
          $._concat_word, // string
          repeat($._concat_word),
        ),
      ),

    _builtin: ($) =>
      choice(
        $.after,
        $.append,
        $.catch,
        $.conditional,
        $.expr_cmd,
        $.foreach,
        $.global,
        $.namespace,
        $.package,
        $.procedure,
        $.regexp,
        $.regsub,
        $.set,
        $.try,
        $.while,
      ),

    // ------------------------------------------------------------------------
    // regsub ?switches? exp string subSpec ?varName?
    // ------------------------------------------------------------------------
    regsub: ($) =>
      prec.left(
        seq(
          token(prec(1, "regsub")),
          optional($.regsub_switches),
          field("pattern", $.regsub_literal),
          field("input", $._word),
          field("substitution", $.regsub_literal),
          optional(field("varName", $.simple_word)),
        ),
      ),

    regsub_switches: ($) => repeat1($.regsub_switch),

    regsub_switch: ($) =>
      prec.left(
        repeat1(
          seq(
            choice(
              "-all",
              "-expanded",
              "-line",
              "-linestop",
              "-lineanchor",
              "-nocase",
              seq("-start", $._number),
              "--",
            ),
            " ",
          ),
        ),
      ),

    /*
      regsub_literal accepts an argument as one of:
        - a braced literal (e.g. {pattern})
        - a quoted literal (e.g. "pattern")
        - a simple word (e.g. pattern)
      Each is parsed as a single token.
    */
    regsub_literal: ($) =>
      choice(
        token(seq("{", /[^}]*/, "}")),
        token(seq('"', /[^"]*/, '"')),
        $.simple_word,
      ),

    while: ($) =>
      prec.left(
        seq(
          "while",
          choice(seq("{", $._expr, "}"), $.expr),
          choice($.braced_word, $._word),
        ),
      ),

    expr_cmd: ($) => seq("expr", $.expr),

    foreach: ($) =>
      prec.left(
        seq(
          "foreach",
          repeat1(seq($._word, $._word)), // Supports multiple var-list pairs
          $._word, // Body
        ),
      ),

    global: ($) => prec.left(seq("global", repeat1($.simple_word))),

    namespace: ($) =>
      prec.left(
        seq(
          "namespace", // The `namespace` keyword.
          choice(
            seq("children", optional($.simple_word), optional($.simple_word)), // `namespace children ?namespace? ?pattern?`
            seq("code", $._word), // `namespace code script`
            "current", // `namespace current`
            seq("delete", repeat1($.simple_word)), // `namespace delete ?namespace namespace ...?`
            seq("eval", $.simple_word, repeat($._word)), // `namespace eval namespace arg ?arg ...?`
            seq("exists", $.simple_word), // `namespace exists namespace`
            seq("export", optional("-clear"), repeat($.simple_word)), // `namespace export ?-clear? ?pattern pattern ...?`
            seq("forget", repeat($.simple_word)), // `namespace forget ?pattern pattern ...?`
            seq("import", optional("-force"), repeat($.simple_word)), // `namespace import ?-force? ?pattern pattern ...?`
            seq("inscope", $.simple_word, $._word, repeat($._word)), // `namespace inscope namespace script ?arg ...?`
            seq("origin", $.simple_word), // `namespace origin command`
            seq("parent", optional($.simple_word)), // `namespace parent ?namespace?`
            seq("qualifiers", $.simple_word), // `namespace qualifiers string`
            seq("tail", $.simple_word), // `namespace tail string`
            seq(
              "which",
              optional(choice("-command", "-variable")), // `namespace which ?-command? ?-variable? name`
              $.simple_word,
            ),
          ),
        ),
      ),

    try: ($) =>
      seq(
        "try",
        $._word,
        optional(seq("on", "error", $.arguments, $._word)),
        optional($.finally),
      ),

    finally: ($) => seq("finally", $._word),

    _command: ($) => choice($._builtin, $.command),

    command: ($) =>
      prec.left(
        seq(
          field("name", $._word), // Command name
          optional(field("arguments", $.word_list)), // Optional arguments
        ),
      ),

    word_list: ($) => prec.left(repeat1($._word)),

    unpack: (_) => "{*}",

    _word: ($) =>
      seq(optional($.unpack), choice($.braced_word, $._concat_word)),

    _word_simple: ($) =>
      interleaved1(
        choice(
          $.escaped_character,
          $.command_substitution,
          $.simple_word,
          $.quoted_word,
          $.variable_substitution,
          $.braced_word_simple,
        ),
        $._concat,
      ),

    _concat_word: ($) =>
      interleaved1(
        choice(
          $.escaped_character,
          $.command_substitution,
          seq($.simple_word, optional($.array_index)),
          $.quoted_word,
          $.variable_substitution,
        ),
        $._concat,
      ),

    _ns_delim: (_) => token.immediate("::"),

    _ident_imm: (_) => token.immediate(/[a-zA-Z_][a-zA-Z0-9_]*/),
    _ident: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    _id_immediate: ($) =>
      seq(
        optional($._ns_delim),
        $._ident_imm,
        repeat(seq($._ns_delim, $._ident_imm)),
      ),

    id: ($) =>
      seq(
        choice(seq("::", $._ident_imm), $._ident),
        repeat(seq($._ns_delim, $._ident_imm)),
      ),

    array_index: ($) => seq(token.immediate("("), $._word_simple, ")"),

    variable_substitution: ($) =>
      seq(
        "$",
        choice(
          seq(alias($._id_immediate, $.id)),
          seq("{", alias(token(/[^}]+/), $.id), "}"),
        ),
        optional($.array_index),
      ),

    braced_word: ($) =>
      seq(
        "{",
        optional(
          seq(
            interleaved1($._command, repeat1($._terminator)),
            repeat($._terminator),
          ),
        ),
        "}",
      ),

    braced_word_simple: ($) => seq("{", repeat($._word_simple), "}"),

    set: ($) =>
      prec.left(
        seq(
          "set",
          choice(
            seq($.id, optional($.array_index)),
            seq("$", "{", /[^}]+/, "}"),
          ),
          optional($._word_simple),
        ),
      ),

    procedure: ($) =>
      seq(
        "proc",
        field("name", $._word),
        field("arguments", $.arguments),
        field("body", $._word),
      ),

    _argument_word: ($) => choice($.simple_word, $.quoted_word, $.braced_word),

    argument: ($) =>
      choice(
        field("name", $.simple_word),
        seq(
          "{",
          field("name", $.simple_word),
          optional(field("default", $._argument_word)),
          "}",
        ),
      ),

    arguments: ($) => choice(seq("{", repeat($.argument), "}"), $.simple_word),

    _number: ($) =>
      token(
        seq(
          optional(choice("-", "+")), // Allow optional negative sign
          /[0-9]+(\.[0-9]+)?/, // Integer or floating-point number
          optional(/[eE][+-]?[0-9]+/), // Scientific notation (e.g., `2.3e10`)
        ),
      ),

    _boolean: ($) =>
      token(choice("1", "0", /[Tt][Rr][Uu][Ee]/, /[Ff][Aa][Ll][Ss][Ee]/)),

    _expr_atom_no_brace: ($) =>
      choice(
        // As a numeric value, either integer or floating-point.
        $._number,

        // As a boolean value, using any form understood by string is boolean.
        $._boolean,

        // As a mathematical function whose arguments have any of the above
        // forms for operands, such as sin($x). See MATH FUNCTIONS below for a
        // discussion of how mathematical functions are handled.
        seq($.simple_word, "(", $._expr, ")"),

        // As a Tcl command enclosed in brackets. The command will be executed
        // and its result will be used as the operand.
        $.command_substitution,

        // As a string enclosed in double-quotes. The expression parser will
        // perform backslash, variable, and command substitutions on the
        // information between the quotes, and use the resulting value as the
        // operand
        $.quoted_word,

        // As a Tcl variable, using standard $ notation. The variable's value
        // will be used as the operand.
        $.variable_substitution,
      ),

    _expr: ($) =>
      choice(
        $.unary_expr,
        $.binop_expr,
        $.ternary_expr,
        $.escaped_character,
        seq("(", $._expr, ")"),
        $._expr_atom_no_brace,
        $.command_substitution,

        // As a string enclosed in braces. The characters between the open
        // brace and matching close brace will be used as the operand without
        // any substitutions.
        $.braced_word_simple,
      ),

    expr: ($) => choice(seq("{", $._expr, "}"), $._expr_atom_no_brace),

    unary_expr: ($) =>
      prec.left(PREC.unary, seq(choice("-", "+", "~", "!"), $._expr)),

    binop_expr: ($) =>
      choice(
        prec.left(PREC.exp, seq($._expr, "**", $._expr)),
        prec.left(PREC.muldiv, seq($._expr, choice("/", "*", "%"), $._expr)),
        prec.left(PREC.addsub, seq($._expr, choice("+", "-"), $._expr)),
        prec.left(PREC.shift, seq($._expr, choice("<<", ">>"), $._expr)),
        prec.left(
          PREC.compare,
          seq($._expr, choice(">", "<", ">=", "<="), $._expr),
        ),
        prec.left(PREC.equal_bool, seq($._expr, choice("==", "!="), $._expr)),
        prec.left(PREC.equal_string, seq($._expr, choice("eq", "ne"), $._expr)),
        prec.left(PREC.contain, seq($._expr, choice("in", "ni"), $._expr)),
        prec.left(PREC.and_bit, seq($._expr, "&", $._expr)),
        prec.left(PREC.xor_bit, seq($._expr, "^", $._expr)),
        prec.left(PREC.or_bit, seq($._expr, "|", $._expr)),
        prec.left(PREC.and_logical, seq($._expr, "&&", $._expr)),
        prec.left(PREC.or_logical, seq($._expr, "||", $._expr)),
      ),

    ternary_expr: ($) =>
      prec.left(PREC.ternary, seq($._expr, "?", $._expr, ":", $._expr)),

    elseif: ($) => seq("elseif", field("condition", $.expr), $._word),

    else: ($) => seq("else", $._word),

    conditional: ($) =>
      seq(
        "if",
        field("condition", $.expr),
        $._word,
        repeat($.elseif),
        optional($.else),
      ),

    // catch script ?varName?
    catch: ($) => prec.left(seq("catch", $._word, optional($._concat_word))),

    quoted_word: ($) =>
      choice(
        '""', // Explicitly allow an empty string
        seq(
          '"',
          repeat(
            choice(
              $.variable_substitution,
              $._quoted_word_content,
              $.command_substitution,
              $.escaped_character,
            ),
          ),
          '"',
        ),
      ),

    escaped_character: (_) => /\\./,

    _quoted_word_content: (_) => token(prec(-1, /[^$\\\[\]"]+/)),

    command_substitution: ($) =>
      seq(
        "[",
        optional(seq($._command, repeat(choice($._terminator, $._command)))),
        "]",
      ),

    simple_word: (_) => /[^!$\s\\\[\]{}();"]+/,
  },
});
