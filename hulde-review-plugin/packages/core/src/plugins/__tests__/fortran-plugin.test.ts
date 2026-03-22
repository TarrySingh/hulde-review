import { describe, it, expect } from "vitest";
import { FortranPlugin } from "../fortran-plugin.js";

const NASTRAN_SAMPLE = `      SUBROUTINE BTSTRP
C     BOOTSTRAP ROUTINE FOR NASTRAN
      EXTERNAL        LSHIFT ,RSHIFT ,ANDF   ,COMPLF
      INTEGER         SYSBUF ,OUTTAP ,TWO
      COMMON /MACHIN/ MACHX  ,IHALF  ,JHALF
      COMMON /SYSTEM/ B(100)
      DATA    NMACH / 22 /
      CALL INITLZ
      CALL RDMACH(MACH)
      RETURN
      END
      FUNCTION SQUARE(X)
      REAL X, SQUARE
      SQUARE = X * X
      RETURN
      END
      PROGRAM NASTRAN
      CALL BTSTRP
      CALL XSORT
      STOP
      END
`;

describe("FortranPlugin", () => {
  const plugin = new FortranPlugin();

  it("has correct metadata", () => {
    expect(plugin.name).toBe("fortran");
    expect(plugin.languages).toEqual(["fortran"]);
  });

  describe("analyzeFile — NASTRAN fixed-format sample", () => {
    const result = plugin.analyzeFile("test.f", NASTRAN_SAMPLE);

    it("extracts 3 functions: BTSTRP, SQUARE, NASTRAN", () => {
      const names = result.functions.map((f) => f.name);
      expect(names).toContain("BTSTRP");
      expect(names).toContain("SQUARE");
      expect(names).toContain("NASTRAN");
      expect(names).toHaveLength(3);
    });

    it("extracts BTSTRP parameters as empty (no args)", () => {
      const btstrp = result.functions.find((f) => f.name === "BTSTRP");
      expect(btstrp).toBeDefined();
      expect(btstrp!.params).toEqual([]);
    });

    it("extracts SQUARE parameter X", () => {
      const sq = result.functions.find((f) => f.name === "SQUARE");
      expect(sq).toBeDefined();
      expect(sq!.params).toEqual(["X"]);
    });

    it("extracts COMMON blocks as imports: MACHIN, SYSTEM", () => {
      const commonImports = result.imports.filter((i) =>
        i.source.startsWith("COMMON/"),
      );
      const blockNames = commonImports.map((i) => i.source);
      expect(blockNames).toContain("COMMON/MACHIN");
      expect(blockNames).toContain("COMMON/SYSTEM");
    });

    it("extracts COMMON/MACHIN specifiers", () => {
      const machin = result.imports.find(
        (i) => i.source === "COMMON/MACHIN",
      );
      expect(machin).toBeDefined();
      expect(machin!.specifiers).toContain("MACHX");
      expect(machin!.specifiers).toContain("IHALF");
      expect(machin!.specifiers).toContain("JHALF");
    });

    it("extracts EXTERNAL declarations as exports: LSHIFT, RSHIFT, ANDF, COMPLF", () => {
      const names = result.exports.map((e) => e.name);
      expect(names).toContain("LSHIFT");
      expect(names).toContain("RSHIFT");
      expect(names).toContain("ANDF");
      expect(names).toContain("COMPLF");
    });
  });

  describe("extractCallGraph — NASTRAN fixed-format sample", () => {
    const entries = plugin.extractCallGraph!("test.f", NASTRAN_SAMPLE);

    it("extracts BTSTRP -> INITLZ call", () => {
      const call = entries.find(
        (e) => e.caller === "BTSTRP" && e.callee === "INITLZ",
      );
      expect(call).toBeDefined();
    });

    it("extracts BTSTRP -> RDMACH call", () => {
      const call = entries.find(
        (e) => e.caller === "BTSTRP" && e.callee === "RDMACH",
      );
      expect(call).toBeDefined();
    });

    it("extracts NASTRAN -> BTSTRP call", () => {
      const call = entries.find(
        (e) => e.caller === "NASTRAN" && e.callee === "BTSTRP",
      );
      expect(call).toBeDefined();
    });

    it("extracts NASTRAN -> XSORT call", () => {
      const call = entries.find(
        (e) => e.caller === "NASTRAN" && e.callee === "XSORT",
      );
      expect(call).toBeDefined();
    });

    it("has exactly 4 call graph entries", () => {
      expect(entries).toHaveLength(4);
    });
  });

  describe("resolveImports", () => {
    const resolutions = plugin.resolveImports("test.f", NASTRAN_SAMPLE);

    it("resolves COMMON blocks as virtual paths", () => {
      const machin = resolutions.find((r) => r.source === "COMMON/MACHIN");
      expect(machin).toBeDefined();
      expect(machin!.resolvedPath).toBe("COMMON/MACHIN");
    });
  });

  describe("free-format Fortran (F90+)", () => {
    const F90_SAMPLE = `module math_utils
  implicit none
  integer :: counter
  real :: pi = 3.14159

contains

  subroutine add(a, b, result)
    real, intent(in) :: a, b
    real, intent(out) :: result
    result = a + b
  end subroutine add

  function multiply(x, y) result(product)
    real, intent(in) :: x, y
    real :: product
    product = x * y
  end function multiply

end module math_utils

program test_math
  use math_utils, only: add, multiply
  implicit none
  real :: r
  call add(1.0, 2.0, r)
end program test_math
`;

    it("extracts MODULE as a class with methods and properties", () => {
      const result = plugin.analyzeFile("test.f90", F90_SAMPLE);
      const mod = result.classes.find((c) => c.name === "MATH_UTILS");
      expect(mod).toBeDefined();
      expect(mod!.methods).toContain("ADD");
      expect(mod!.methods).toContain("MULTIPLY");
      expect(mod!.properties).toContain("COUNTER");
      expect(mod!.properties).toContain("PI");
    });

    it("extracts USE statement as import", () => {
      const result = plugin.analyzeFile("test.f90", F90_SAMPLE);
      const useImport = result.imports.find(
        (i) => i.source === "MATH_UTILS",
      );
      expect(useImport).toBeDefined();
      expect(useImport!.specifiers).toContain("add");
      expect(useImport!.specifiers).toContain("multiply");
    });

    it("extracts call graph for free-format", () => {
      const entries = plugin.extractCallGraph!("test.f90", F90_SAMPLE);
      const call = entries.find(
        (e) => e.caller === "TEST_MATH" && e.callee === "ADD",
      );
      expect(call).toBeDefined();
    });
  });

  describe("ENTRY points", () => {
    const ENTRY_SAMPLE = `      SUBROUTINE MAIN_SUB(X)
      REAL X
      X = X + 1
      RETURN
      ENTRY ALT_ENTRY(X)
      X = X + 2
      RETURN
      END
`;

    it("extracts ENTRY as additional function", () => {
      const result = plugin.analyzeFile("test.f", ENTRY_SAMPLE);
      const names = result.functions.map((f) => f.name);
      expect(names).toContain("MAIN_SUB");
      expect(names).toContain("ALT_ENTRY");
    });
  });

  describe("INCLUDE statements", () => {
    const INCLUDE_SAMPLE = `      SUBROUTINE FOO
      INCLUDE 'common.inc'
      CALL BAR
      END
`;

    it("extracts INCLUDE as import", () => {
      const result = plugin.analyzeFile("test.f", INCLUDE_SAMPLE);
      const inc = result.imports.find((i) => i.source === "common.inc");
      expect(inc).toBeDefined();
    });
  });

  describe("BLOCK DATA", () => {
    const BLOCK_DATA_SAMPLE = `      BLOCK DATA INIT_VALUES
      COMMON /VALS/ A, B, C
      DATA A, B, C / 1.0, 2.0, 3.0 /
      END BLOCK DATA INIT_VALUES
`;

    it("extracts BLOCK DATA as function", () => {
      const result = plugin.analyzeFile("test.f", BLOCK_DATA_SAMPLE);
      const bd = result.functions.find((f) => f.name === "INIT_VALUES");
      expect(bd).toBeDefined();
    });
  });

  describe("EQUIVALENCE detection", () => {
    const EQUIV_SAMPLE = `      SUBROUTINE DANGER
      REAL A(10), B(10)
      EQUIVALENCE (A, B)
      END
`;

    it("flags EQUIVALENCE as import with warning", () => {
      const result = plugin.analyzeFile("test.f", EQUIV_SAMPLE);
      const equiv = result.imports.find((i) => i.source === "EQUIVALENCE");
      expect(equiv).toBeDefined();
      expect(equiv!.specifiers).toContain("ALIASING_WARNING");
    });
  });

  describe("format detection", () => {
    it("detects .f as fixed format", () => {
      // Fixed format should parse correctly with column-based extraction
      const result = plugin.analyzeFile("test.f", NASTRAN_SAMPLE);
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it("detects .f90 as free format", () => {
      const freeCode = `program hello
  print *, "Hello"
end program hello
`;
      const result = plugin.analyzeFile("test.f90", freeCode);
      expect(result.functions.find((f) => f.name === "HELLO")).toBeDefined();
    });
  });

  describe("continuation lines (fixed format)", () => {
    const CONTINUATION_SAMPLE = `      SUBROUTINE LONGNAME(A, B,
     +    C, D)
      CALL OTHER
      END
`;

    it("joins continuation lines and extracts all parameters", () => {
      const result = plugin.analyzeFile("test.f", CONTINUATION_SAMPLE);
      const sub = result.functions.find((f) => f.name === "LONGNAME");
      expect(sub).toBeDefined();
      expect(sub!.params).toContain("A");
      expect(sub!.params).toContain("B");
      expect(sub!.params).toContain("C");
      expect(sub!.params).toContain("D");
    });
  });
});
