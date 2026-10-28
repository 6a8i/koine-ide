import { m as msg, getMessageLocale } from "../i18n/messages";
import { word } from "../i18n";
import { KoineError } from "../shared/types";
import { LinkResult } from "../shared/modules";
import * as A from "./ast";
import { T, T_UNK, TypeRef, typeName, isAggregate, withDims } from "./ast";
import { GLOBAL_BUILTINS, LIBS } from "./builtins";
import { RawModule, RawField, RawClass } from "./parser";

interface Sym {
  name: string;
  slot: number;
  global: boolean;
  t: TypeRef;
  ref: boolean;
  isConst: boolean;
  line: number;
  col: number;
}

type Loc = { line: number; col: number; file?: number };
const err = (msg: string, n: Loc) => new KoineError(msg, n.line, n.col, "sintaxe", n.file ?? 0);

export function same(a: TypeRef, b: TypeRef): boolean {
  if (a.base !== b.base || a.dims !== b.dims) return false;
  if (a.base === "estrutura" || a.base === "classe") return a.decl === b.decl;
  if (a.base === "ref") return !!a.elem && !!b.elem && same(a.elem, b.elem);
  return true;
}
function isNum(t: TypeRef) {
  return t.dims === 0 && (t.base === "inteiro" || t.base === "real");
}
/** Pode atribuir um valor do tipo `from` numa variável do tipo `to`? */
export function assignable(to: TypeRef, from: TypeRef): boolean {
  if (to.base === "?" || from.base === "?") return true;
  if (from.base === "nulo") return to.dims === 0 && (to.base === "classe" || to.base === "ref");
  if (to.dims !== from.dims) return false;
  switch (to.base) {
    case "estrutura": return from.base === "estrutura" && to.decl === from.decl;
    case "classe": return from.base === "classe" && (from.decl === to.decl || (from.decl as A.ClassDecl).ancestors.has(to.decl as A.ClassDecl));
    case "ref": return from.base === "ref" && !!to.elem && !!from.elem && same(to.elem, from.elem);
  }
  if (to.base === from.base) return true;
  if (to.base === "real" && from.base === "inteiro") return true;
  if (to.base === "cadeia" && from.base === "caracter") return true;
  return false;
}

const isLValueExpr = (e: A.Expr) => e.k === "var" || e.k === "index" || e.k === "member" || e.k === "deref";
/** Estrutura vinda de um lugar com nome precisa ser copiada; temporários não. */
const needsCopy = (t: TypeRef, e: A.Expr) => t.base === "estrutura" && t.dims === 0 && isLValueExpr(e);

interface LinkedInput {
  modules: RawModule[]; // ordem topológica (entrada por último)
  entry: RawModule;
  link: LinkResult<RawModule>;
  files: string[];
  /** modo de testes (ver CompileOptions) */
  tests?: boolean;
}

export function resolveKoine(input: LinkedInput): A.ProgramAst {
  return new Resolver(input).run();
}

class Resolver {
  private scopes: Map<string, Sym>[] = [];
  private nglobals = 0;
  private nslots = 0;
  private curFn: A.FuncDecl | null = null;
  private curModule!: A.ModuleInfo;
  private curClass: A.ClassDecl | null = null;
  private loopDepth = 0;
  private switchDepth = 0;
  /** para análise de bloqueio */
  private calls = new Map<A.FuncDecl, Set<A.FuncDecl>>();
  private callNodes: (A.Call | A.MethodCall | A.New)[] = [];
  private modules: A.ModuleInfo[] = [];
  private infoOf = new Map<RawModule, A.ModuleInfo>();
  private rawOf = new Map<A.ModuleInfo, RawModule>();
  private structs: A.StructDecl[] = [];
  private classes: A.ClassDecl[] = [];
  private rawClass = new Map<A.ClassDecl, RawClass>();
  private functions = new Map<string, A.FuncDecl>();
  private globals: A.Decl[] = [];
  private allFns: A.FuncDecl[] = [];
  /** este em métodos: slot 0 */
  private esteType: TypeRef | null = null;

  constructor(private input: LinkedInput) {}

  run(): A.ProgramAst {
    // 1. módulos e seus nomes
    for (const raw of this.input.modules) {
      const info: A.ModuleInfo = {
        index: raw.fileIndex, file: raw.file, name: raw.moduleName, imports: [],
        scope: { fns: new Map(), globals: new Map(), types: new Map(), libAlias: new Map(), modAlias: new Map() },
        isTest: !!this.input.tests && raw.importable && raw.tests.length > 0,
      };
      this.modules.push(info);
      this.infoOf.set(raw, info);
      this.rawOf.set(info, raw);
    }
    for (const raw of this.input.modules) {
      const info = this.infoOf.get(raw)!;
      for (const l of this.input.link.resolved.get(raw) ?? []) {
        const target = this.infoOf.get(l.target)!;
        if (info.scope.modAlias.has(l.alias)) throw err(msg("O apelido \"{alias}\" já está sendo usado por outra importação", { alias: l.alias }), raw.imports.find((i) => i.alias === l.alias) ?? { line: 1, col: 1, file: raw.fileIndex });
        info.scope.modAlias.set(l.alias, target);
        info.imports.push({ target, alias: l.alias });
      }
      for (const inc of raw.includes) {
        if (!LIBS[inc.lib]) throw err(msg("A biblioteca \"{lib}\" não existe. Bibliotecas disponíveis: {lista}", { lib: inc.lib, lista: Object.keys(LIBS).join(", ") }), inc);
        if (info.scope.modAlias.has(inc.alias)) throw err(msg("\"{alias}\" já é o apelido de um módulo importado", { alias: inc.alias }), inc);
        info.scope.libAlias.set(inc.alias, inc.lib);
      }
    }
    // 2. registra tipos e funções de cada módulo (antes de resolver qualquer corpo: referências futuras)
    for (const raw of this.input.modules) this.registerModule(raw);
    // 3. resolve os tipos escritos nas assinaturas, campos e globais
    for (const raw of this.input.modules) this.resolveSignatures(raw);
    // 4. liga classes (herança, layout, vtable, construtores)
    for (const c of this.classes) this.linkClass(c, []);
    // 5. globais, na ordem dos módulos (importados primeiro)
    for (const raw of this.input.modules) {
      this.curModule = this.infoOf.get(raw)!;
      this.curClass = null;
      this.scopes = [];
      for (const d of raw.globals) {
        this.declareGlobal(d);
        this.globals.push(d);
      }
    }
    // 6. corpos
    for (const raw of this.input.modules) {
      this.curModule = this.infoOf.get(raw)!;
      for (const f of raw.functions) this.resolveFn(f, null);
      for (const t of raw.tests) { t.module = this.curModule; this.resolveFn(t, null); this.allFns.push(t); }
    }
    for (const c of this.classes) {
      this.curModule = c.module;
      for (const m of c.methods) this.resolveFn(m, c);
      this.resolveCtor(c);
    }
    // 7. entrada
    const entryInfo = this.infoOf.get(this.input.entry)!;
    let main = entryInfo.scope.fns.get("inicio");
    if (!main) {
      if (!this.input.tests) throw err(msg("O programa precisa ter a função \"inicio\": funcao inicio() { ... }"), { line: 1, col: 1, file: this.input.entry.fileIndex });
      // arquivo só de testes: programa principal vazio
      main = { name: "inicio", qname: "inicio", ret: T("vazio"), params: [], body: [], nslots: 0, blocking: false, visibility: "privado", module: entryInfo, line: 1, col: 1, file: this.input.entry.fileIndex };
    }
    if (main.params.length > 0) throw err(msg("A função \"inicio\" não pode ter parâmetros"), main);
    this.computeBlocking();
    return {
      files: this.input.files, modules: this.modules, globals: this.globals, nglobals: this.nglobals,
      functions: this.functions, structs: this.structs, classes: this.classes, main, entry: entryInfo,
      tests: this.input.entry.tests,
    };
  }

  // ======================= registro =======================
  private registerModule(raw: RawModule) {
    const info = this.infoOf.get(raw)!;
    const sc = info.scope;
    const taken = (name: string, n: Loc) => {
      if (sc.fns.has(name)) throw err(msg("\"{name}\" já é o nome de uma função neste arquivo", { name }), n);
      if (sc.types.has(name)) throw err(msg("\"{name}\" já é o nome de uma estrutura ou classe neste arquivo", { name }), n);
      if (GLOBAL_BUILTINS[name]) throw err(msg("\"{name}\" já é uma função do Koiné e não pode ser redeclarada", { name }), n);
      if (sc.modAlias.has(name) || sc.libAlias.has(name)) throw err(msg("\"{name}\" já é o nome de um módulo ou biblioteca importada", { name }), n);
    };
    for (const s of raw.structs) {
      taken(s.name, s);
      const decl: A.StructDecl = {
        kind: "struct", name: s.name, qname: `${info.name}.${s.name}`, module: info, visibility: s.visibility,
        fields: [], fieldIndex: new Map(), fieldNames: [], line: s.line, col: s.col, file: s.file,
      };
      s.fields.forEach((f, i) => {
        if (decl.fieldIndex.has(f.name)) throw err(msg("O campo \"{name}\" já existe na estrutura {name2}", { name: f.name, name2: s.name }), f);
        decl.fields.push(this.makeField(f, decl, i));
        decl.fieldIndex.set(f.name, i);
        decl.fieldNames.push(f.name);
      });
      sc.types.set(s.name, decl);
      this.structs.push(decl);
    }
    for (const c of raw.classes) {
      taken(c.name, c);
      const decl: A.ClassDecl = {
        kind: "class", name: c.name, qname: `${info.name}.${c.name}`, module: info, visibility: c.visibility,
        parentName: c.parentName, parent: null, ownFields: [], allFields: [], fieldIndex: new Map(), fieldNames: [],
        methods: [], ctor: null, vtable: [], methodIndex: new Map(), ancestors: new Set(), linked: false,
        line: c.line, col: c.col, file: c.file,
      };
      c.fields.forEach((f) => decl.ownFields.push(this.makeField(f, decl, -1)));
      for (const m of c.methods) {
        if (decl.methods.some((x) => x.name === m.name)) throw err(msg("O método \"{name}\" já foi declarado na classe {name2}", { name: m.name, name2: c.name }), m);
        if (c.fields.some((f) => f.name === m.name)) throw err(msg("\"{name}\" já é um campo da classe {name2}; um método não pode ter o mesmo nome", { name: m.name, name2: c.name }), m);
        const md = m as A.MethodDecl;
        md.cls = decl; md.vslot = -1; md.isCtor = false; md.module = info;
        decl.methods.push(md);
      }
      if (c.ctor) {
        const ct = c.ctor as A.MethodDecl;
        ct.cls = decl; ct.vslot = -1; ct.isCtor = true; ct.module = info;
        decl.ctor = ct;
      }
      sc.types.set(c.name, decl);
      this.classes.push(decl);
      this.rawClass.set(decl, c);
    }
    for (const f of raw.functions) {
      taken(f.name, f);
      f.module = info;
      f.qname = info === this.infoOf.get(this.input.entry) ? f.name : `${info.name}.${f.name}`;
      sc.fns.set(f.name, f);
      this.functions.set(f.qname, f);
      this.allFns.push(f);
    }
    for (const d of raw.globals) {
      if (sc.fns.has(d.name) || sc.types.has(d.name)) throw err(msg("\"{name}\" já é o nome de uma função, estrutura ou classe neste arquivo", { name: d.name }), d);
      d.module = info;
    }
  }

  private makeField(f: RawField, owner: A.StructDecl | A.ClassDecl, index: number): A.Field {
    const dims: number[] = [];
    for (const s of f.sizes) {
      if (s.k !== "lit" || typeof s.value !== "number" || !Number.isInteger(s.value) || s.value < 0)
        throw err(msg("O tamanho do campo \"{name}\" deve ser um número inteiro fixo (ex.: inteiro v[10])", { name: f.name }), s);
      dims.push(s.value);
    }
    return { name: f.name, t: f.t, dims, init: f.init, visibility: f.visibility, index, owner, line: f.line, col: f.col, file: f.file };
  }

  // ======================= tipos =======================
  /** Procura um tipo pelo nome (local, importado público, ou qualificado). */
  private findType(name: string, n: Loc, mod: A.ModuleInfo = this.curModule): A.StructDecl | A.ClassDecl {
    const dot = name.indexOf(".");
    if (dot > 0) {
      const alias = name.slice(0, dot), tn = name.slice(dot + 1);
      const target = mod.scope.modAlias.get(alias);
      if (!target) {
        if (mod.scope.libAlias.has(alias)) throw err(msg("A biblioteca {alias} não tem tipos", { alias }), n);
        throw err(msg("O módulo \"{alias}\" não foi importado. Use: importe {alias2}", { alias, alias2: alias }), n);
      }
      const t = target.scope.types.get(tn);
      if (!t) throw err(msg("O módulo {name} não tem uma estrutura ou classe chamada \"{tn}\"", { name: target.name, tn }), n);
      if (!this.visible(t.visibility, mod)) throw err(msg("\"{tn}\" é privado no módulo {name}; declare-o como \"publico\" para usá-lo em outro módulo", { tn, name: target.name }), n);
      return t;
    }
    const local = mod.scope.types.get(name);
    if (local) return local;
    const hits: { m: A.ModuleInfo; t: A.StructDecl | A.ClassDecl }[] = [];
    for (const imp of mod.imports) {
      const t = imp.target.scope.types.get(name);
      if (t && this.visible(t.visibility, mod)) hits.push({ m: imp.target, t });
    }
    if (hits.length > 1) throw err(msg("\"{name}\" existe em {lista}. Use {v}.{name2} ou {v2}.{name3}", { name, lista: hits.map((h) => h.m.name).join(" e "), v: hits[0].m.name, name2: name, v2: hits[1].m.name, name3: name }), n);
    if (hits.length === 1) return hits[0].t;
    // dicas
    for (const imp of mod.imports) {
      const t = imp.target.scope.types.get(name);
      if (t) throw err(msg("\"{name}\" é privado no módulo {name2}; declare-o como \"publico\" para usá-lo em outro módulo", { name, name2: imp.target.name }), n);
    }
    if (mod.scope.fns.has(name) || GLOBAL_BUILTINS[name]) throw err(msg("\"{name}\" é uma função, não um tipo. Faltaram os parênteses na chamada?", { name }), n);
    if (mod.scope.globals.has(name)) throw err(msg("\"{name}\" é uma variável, não um tipo", { name }), n);
    throw err(msg("O tipo \"{name}\" não existe. Use inteiro, real, cadeia, caracter, logico ou uma estrutura/classe declarada", { name }), n);
  }

  private resolveType(t: TypeRef, n: Loc, mod: A.ModuleInfo = this.curModule): TypeRef {
    if (t.base === "named") {
      const decl = this.findType(t.name!, n, mod);
      return { base: decl.kind === "struct" ? "estrutura" : "classe", dims: t.dims, name: decl.name, decl };
    }
    if (t.base === "ref") {
      const elem = this.resolveType(t.elem!, n, mod);
      if (elem.base === "ref") throw err(msg("Não é possível ter uma referência para outra referência (ref ref)"), n);
      if (elem.base === "vazio") throw err(msg("\"ref vazio\" não faz sentido"), n);
      return { base: "ref", dims: t.dims, elem };
    }
    return t;
  }

  private resolveSignatures(raw: RawModule) {
    const info = this.infoOf.get(raw)!;
    this.curModule = info;
    const fnSig = (f: A.FuncDecl) => {
      f.ret = this.resolveType(f.ret, f, info);
      if (f.ret.base === "estrutura" && f.ret.dims > 0) throw err(msg("Funções não retornam vetores"), f);
      for (const p of f.params) {
        p.t = this.resolveType(p.t, f, info);
        if (p.t.base === "vazio") throw err(msg("O parâmetro \"{name}\" não pode ser do tipo vazio", { name: p.name }), f);
      }
    };
    for (const f of raw.functions) fnSig(f);
    for (const s of this.structs) if (s.module === info) for (const fd of s.fields) fd.t = this.checkFieldType(this.resolveType(fd.t, fd, info), fd);
    for (const c of this.classes) {
      if (c.module !== info) continue;
      for (const fd of c.ownFields) fd.t = this.checkFieldType(this.resolveType(fd.t, fd, info), fd);
      for (const m of c.methods) fnSig(m);
      if (c.ctor) fnSig(c.ctor);
      if (c.parentName) {
        const p = this.findType(c.parentName, c, info);
        if (p.kind !== "class") throw err(msg("\"{parentName}\" é uma estrutura; só é possível herdar de classes", { parentName: c.parentName }), c);
        c.parent = p;
      }
    }
    for (const d of raw.globals) d.t = this.resolveType(d.t, d, info);
  }

  private checkFieldType(t: TypeRef, fd: A.Field): TypeRef {
    if (t.base === "vazio") throw err(msg("O campo \"{name}\" não pode ser do tipo vazio", { name: fd.name }), fd);
    if (t.base === "estrutura" && t.decl === fd.owner) throw err(msg("A estrutura {name} não pode conter um campo do próprio tipo (use ref {name2} ou uma classe)", { name: fd.owner.name, name2: fd.owner.name }), fd);
    if (t.dims > 0 && fd.dims.length !== t.dims) throw err(msg("O campo \"{name}\" precisa de tamanho fixo", { name: fd.name }), fd);
    return t;
  }

  // ======================= classes =======================
  private linkClass(c: A.ClassDecl, chain: A.ClassDecl[]) {
    if (c.linked) return;
    if (chain.includes(c)) throw err(msg("A classe {name} herda de si mesma (direta ou indiretamente): {lista}", { name: c.name, lista: [...chain, c].map((x) => x.name).join(" → ") }), c);
    if (c.parent) {
      this.linkClass(c.parent, [...chain, c]);
      c.ancestors = new Set([c.parent, ...c.parent.ancestors]);
      c.allFields = [...c.parent.allFields];
      c.vtable = [...c.parent.vtable];
      c.methodIndex = new Map(c.parent.methodIndex);
    }
    for (const f of c.ownFields) {
      if (c.allFields.some((x) => x.name === f.name)) throw err(msg("O campo \"{name}\" já existe na classe {v}, da qual {name2} herda", { name: f.name, v: c.parent!.name, name2: c.name }), f);
      if (c.methodIndex.has(f.name)) throw err(msg("\"{name}\" já é um método herdado; um campo não pode ter o mesmo nome", { name: f.name }), f);
      f.index = c.allFields.length;
      c.allFields.push(f);
    }
    c.fieldIndex = new Map(c.allFields.map((f) => [f.name, f.index]));
    c.fieldNames = c.allFields.map((f) => f.name);
    for (const m of c.methods) {
      if (c.fieldIndex.has(m.name)) throw err(msg("\"{name}\" já é um campo; um método não pode ter o mesmo nome", { name: m.name }), m);
      const existing = c.methodIndex.get(m.name);
      if (existing !== undefined) {
        const base = c.vtable[existing];
        if (!this.sameSignature(base, m))
          throw err(msg("O método {name} em {name2} sobrescreve {name3}.{name4} com uma assinatura diferente (os parâmetros e o retorno devem ser iguais)", { name: m.name, name2: c.name, name3: base.cls.name, name4: m.name }), m);
        m.vslot = existing;
        c.vtable[existing] = m;
      } else {
        m.vslot = c.vtable.length;
        c.methodIndex.set(m.name, m.vslot);
        c.vtable.push(m);
      }
    }
    // construtor: sintetiza se não existe
    if (!c.ctor) {
      c.ctor = {
        name: c.name, qname: `${c.name}.${c.name}`, ret: T("vazio"), params: [], body: [], nslots: 0, blocking: false,
        visibility: "publico", module: c.module, cls: c, vslot: -1, isCtor: true, line: c.line, col: c.col, file: c.file,
      };
    }
    // `este` como primeiro parâmetro de métodos e construtor
    const self: TypeRef = { base: "classe", dims: 0, name: c.name, decl: c };
    for (const m of [...c.methods, c.ctor]) m.params.unshift({ name: "este", t: self, ref: false, slot: -1 });
    c.linked = true;
  }

  private sameSignature(a: A.FuncDecl, b: A.FuncDecl): boolean {
    // `a` já tem `este`; `b` ainda não (linkClass insere depois)
    const pa = a.params[0]?.name === "este" ? a.params.slice(1) : a.params;
    const pb = b.params[0]?.name === "este" ? b.params.slice(1) : b.params;
    if (pa.length !== pb.length || !same(a.ret, b.ret)) return false;
    return pa.every((p, i) => same(p.t, pb[i].t) && p.ref === pb[i].ref);
  }

  private resolveCtor(c: A.ClassDecl) {
    const ctor = c.ctor!;
    const body = ctor.body;
    const isSuperCtor = (s: A.Stmt) => s.k === "expr" && s.e.k === "mcall" && s.e.isSuper && s.e.name === "<construtor>";
    const firstIsSuper = body.length > 0 && isSuperCtor(body[0]);
    for (let i = firstIsSuper ? 1 : 0; i < body.length; i++) {
      if (isSuperCtor(body[i])) throw err(msg("\"super(...)\" só pode aparecer como primeiro comando do construtor"), body[i]);
    }
    if (!firstIsSuper) {
      const parentCtor = c.parent?.ctor;
      if (parentCtor && parentCtor.params.length > 1)
        throw err(msg("A classe {name} precisa chamar super(...) como primeiro comando do construtor, com os parâmetros do construtor de {v} ({lista})", { name: c.name, v: c.parent!.name, lista: parentCtor.params.slice(1).map((p) => typeName(p.t) + " " + p.name).join(", ") }), ctor.body[0] ?? ctor);
      const self: A.Var = { k: "var", line: ctor.line, col: ctor.col, file: ctor.file, blocking: false, name: "este", slot: 0, global: false, ref: false, t: ctor.params[0].t, isConst: false };
      const sup: A.MethodCall = { k: "mcall", line: ctor.line, col: ctor.col, file: ctor.file, blocking: false, obj: self, name: "<construtor>", args: [], copyArgs: [], method: null, vslot: -1, isSuper: true, initsOf: null, t: T("vazio") };
      body.unshift({ k: "expr", line: ctor.line, col: ctor.col, file: ctor.file, blocking: false, e: sup });
    }
    this.resolveFn(ctor, c);
  }

  // ======================= escopo =======================
  private push() { this.scopes.push(new Map()); }
  private pop() { this.scopes.pop(); }

  private lookup(name: string): Sym | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i].get(name);
      if (s) return s;
    }
    return null;
  }

  private lookupGlobal(name: string, n: Loc): A.GlobalSym | null {
    const local = this.curModule.scope.globals.get(name);
    if (local) return local;
    const hits: { m: A.ModuleInfo; g: A.GlobalSym }[] = [];
    for (const imp of this.curModule.imports) {
      const g = imp.target.scope.globals.get(name);
      if (g && this.visible(g.visibility)) hits.push({ m: imp.target, g });
    }
    if (hits.length > 1) throw err(msg("\"{name}\" existe em {lista}. Use {v}.{name2} ou {v2}.{name3}", { name, lista: hits.map((h) => h.m.name).join(" e "), v: hits[0].m.name, name2: name, v2: hits[1].m.name, name3: name }), n);
    return hits[0]?.g ?? null;
  }

  private lookupFn(name: string, n: Loc): A.FuncDecl | null {
    const local = this.curModule.scope.fns.get(name);
    if (local) return local;
    const hits: { m: A.ModuleInfo; f: A.FuncDecl }[] = [];
    for (const imp of this.curModule.imports) {
      const f = imp.target.scope.fns.get(name);
      if (f && this.visible(f.visibility)) hits.push({ m: imp.target, f });
    }
    if (hits.length > 1) throw err(msg("\"{name}\" existe em {lista}. Use {v}.{name2} ou {v2}.{name3}", { name, lista: hits.map((h) => h.m.name).join(" e "), v: hits[0].m.name, name2: name, v2: hits[1].m.name, name3: name }), n);
    return hits[0]?.f ?? null;
  }

  /** Visibilidade efetiva: público, ou qualquer coisa quando o módulo que olha é um arquivo de testes. */
  private visible(v: A.Visibility, from: A.ModuleInfo = this.curModule): boolean {
    return v === "publico" || !!from.isTest;
  }

  private lookupTypeSoft(name: string): A.StructDecl | A.ClassDecl | null {
    try { return this.findType(name, { line: 0, col: 0 }); } catch { return null; }
  }

  private addSym(name: string, t: TypeRef, ref: boolean, isConst: boolean, n: Loc, global: boolean): Sym {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) throw err(msg("A variável \"{name}\" já foi declarada neste bloco", { name }), n);
    if (this.curModule.scope.fns.has(name)) throw err(msg("\"{name}\" já é o nome de uma função", { name }), n);
    if (this.curModule.scope.types.has(name)) throw err(msg("\"{name}\" é o nome de uma estrutura ou classe e não pode ser usado como variável", { name }), n);
    const slot = global ? this.nglobals++ : this.nslots++;
    const sym: Sym = { name, slot, global, t, ref, isConst, line: n.line, col: n.col };
    scope.set(name, sym);
    return sym;
  }

  private declareGlobal(d: A.Decl) {
    const sc = this.curModule.scope;
    if (sc.globals.has(d.name)) throw err(msg("A variável global \"{name}\" já foi declarada neste arquivo", { name: d.name }), d);
    this.scopes = [];
    this.checkDecl(d);
    const slot = this.nglobals++;
    d.slot = slot;
    d.global = true;
    sc.globals.set(d.name, { name: d.name, slot, t: d.t, isConst: d.isConst, visibility: d.visibility, module: this.curModule });
  }

  private checkDecl(d: A.Decl) {
    d.t = this.resolveType(d.t, d);
    if (d.t.base === "vazio") throw err(msg("A variável \"{name}\" não pode ser do tipo vazio", { name: d.name }), d);
    d.sizes = d.sizes.map((s) => (s ? this.expr(s) : null));
    for (const s of d.sizes) {
      if (s && s.t.base !== "inteiro" && s.t.base !== "?") throw err(msg("O tamanho de um vetor deve ser um número inteiro"), s);
    }
    if (d.init) {
      d.init = this.exprOrArray(d.init, d.t);
      if (d.init.k !== "arr" && !assignable(d.t, d.init.t))
        throw err(this.assignMsg(d.t, d.init.t, d.name), d.init);
      d.copy = needsCopy(d.t, d.init);
    } else if (d.t.dims > 0 && d.sizes.some((s) => s === null)) {
      throw err(msg("O vetor \"{name}\" precisa de um tamanho ou de uma lista de valores iniciais", { name: d.name }), d);
    }
    d.blocking = !!(d.init?.blocking || d.sizes.some((s) => s?.blocking));
  }

  private assignMsg(to: TypeRef, from: TypeRef, what: string): string {
    if (to.base === "classe" && from.base === "classe" && to.decl && from.decl && (to.decl as A.ClassDecl).ancestors.has(from.decl as A.ClassDecl))
      return msg("Não é possível guardar um(a) {de} em \"{what}\", que é {para}: nem todo(a) {de} é um(a) {para}", { de: typeName(from), what, para: typeName(to) });
    if (from.base === "nulo") return msg("\"nulo\" só pode ser guardado em variáveis de classe ou ref, e \"{what}\" é {para}", { what, para: typeName(to) });
    return msg("Não é possível guardar um valor do tipo {de} em \"{what}\", que é do tipo {para}", { de: typeName(from), what, para: typeName(to) });
  }

  private declare(d: A.Decl, global: boolean) {
    this.checkDecl(d);
    const sym = this.addSym(d.name, d.t, false, d.isConst, d, global);
    d.slot = sym.slot;
    d.global = global;
  }

  private exprOrArray(e: A.Expr, t: TypeRef): A.Expr {
    if (e.k === "arr") {
      const elemT = withDims(t, t.dims - 1);
      e.items = e.items.map((it) => this.exprOrArray(it, elemT));
      e.copyItems = e.items.map((it) => it.k !== "arr" && needsCopy(elemT, it));
      for (const it of e.items) {
        if (it.k !== "arr" && !assignable(elemT, it.t))
          throw err(msg("Valor do tipo {tipo} numa lista que deveria conter {tipo2}", { tipo: typeName(it.t), tipo2: typeName(elemT) }), it);
      }
      e.t = t;
      e.blocking = e.items.some((i) => i.blocking);
      return e;
    }
    return this.expr(e);
  }

  // ======================= funções =======================
  private resolveFn(f: A.FuncDecl, cls: A.ClassDecl | null) {
    this.curFn = f;
    this.curClass = cls;
    this.nslots = 0;
    this.scopes = [];
    this.push();
    for (const p of f.params) {
      if (p.t.base === "named") p.t = this.resolveType(p.t, f);
      const sym = this.addSym(p.name, p.t, p.ref, false, f, false);
      p.slot = sym.slot;
    }
    this.esteType = cls ? f.params[0].t : null;
    this.calls.set(f, new Set());
    this.stmts(f.body);
    if (f.ret.base !== "vazio" && !this.alwaysReturns(f.body))
      throw err(msg("A função \"{name}\" deve retornar um valor do tipo {tipo} em todos os caminhos (faltou \"retorne\"?)", { name: f.name, tipo: typeName(f.ret) }), f);
    this.pop();
    f.nslots = this.nslots;
    f.blocking = f.body.some((s) => s.blocking);
    this.curFn = null;
    this.curClass = null;
    this.esteType = null;
  }

  private alwaysReturns(body: A.Stmt[]): boolean {
    for (const s of body) {
      if (s.k === "return") return true;
      if (s.k === "if" && s.else && this.alwaysReturns(s.then) && this.alwaysReturns(s.else)) return true;
      if (s.k === "block" && this.alwaysReturns(s.body)) return true;
      if (s.k === "switch" && s.cases.some((c) => c.values === null) && s.cases.every((c) => this.alwaysReturns(c.body))) return true;
      if (s.k === "while" && s.cond.k === "lit" && s.cond.value === true) return true;
    }
    return false;
  }

  private stmts(list: A.Stmt[]) {
    for (let i = 0; i < list.length; i++) list[i] = this.stmt(list[i]);
  }

  private blockScoped(list: A.Stmt[]) {
    this.push();
    this.stmts(list);
    this.pop();
  }

  /** `kw` é a palavra canônica do comando (se/enquanto/para), mostrada no idioma do usuário */
  private cond(e: A.Expr, kw: string): A.Expr {
    const r = this.expr(e);
    const what = word(getMessageLocale(), kw);
    if (r.t.base !== "logico" && r.t.base !== "?") {
      if (r.k === "assign" && r.op === "=")
        throw err(msg("A condição do \"{what}\" usa \"=\" (atribuição). Para comparar valores use \"==\" (dois sinais de igual)", { what }), r);
      throw err(msg("A condição do \"{what}\" deve ser do tipo lógico (verdadeiro/falso), mas é do tipo {tipo}", { what, tipo: typeName(r.t) }), r);
    }
    return r;
  }

  private stmt(s: A.Stmt): A.Stmt {
    switch (s.k) {
      case "decl": this.declare(s, false); return s;
      case "expr": {
        s.e = this.expr(s.e);
        s.blocking = s.e.blocking;
        return s;
      }
      case "if": {
        s.cond = this.cond(s.cond, "se");
        this.blockScoped(s.then);
        if (s.else) this.blockScoped(s.else);
        s.blocking = s.cond.blocking || s.then.some((x) => x.blocking) || !!s.else?.some((x) => x.blocking);
        return s;
      }
      case "while":
      case "dowhile": {
        s.cond = this.cond(s.cond, "enquanto");
        this.loopDepth++;
        this.blockScoped(s.body);
        this.loopDepth--;
        s.blocking = s.cond.blocking || s.body.some((x) => x.blocking);
        return s;
      }
      case "for": {
        this.push();
        if (s.init) s.init = this.stmt(s.init);
        if (s.cond) s.cond = this.cond(s.cond, "para");
        if (s.step) s.step = this.expr(s.step);
        this.loopDepth++;
        this.blockScoped(s.body);
        this.loopDepth--;
        this.pop();
        s.blocking = !!(s.init?.blocking || s.cond?.blocking || s.step?.blocking) || s.body.some((x) => x.blocking);
        return s;
      }
      case "switch": {
        s.e = this.expr(s.e);
        if (isAggregate(s.e.t) || s.e.t.base === "ref") throw err(msg("\"escolha\" só funciona com números, textos e valores lógicos"), s.e);
        this.switchDepth++;
        let hasDefault = false;
        for (const c of s.cases) {
          if (c.values === null) {
            if (hasDefault) throw err(msg("Só pode haver um \"caso contrario\" por \"escolha\""), c);
            hasDefault = true;
          } else {
            c.values = c.values.map((v) => this.expr(v));
            for (const v of c.values) {
              if (!assignable(s.e.t, v.t) && !assignable(v.t, s.e.t))
                throw err(msg("O valor do \"caso\" ({tipo}) não é compatível com a expressão do \"escolha\" ({tipo2})", { tipo: typeName(v.t), tipo2: typeName(s.e.t) }), v);
            }
          }
          this.blockScoped(c.body);
        }
        this.switchDepth--;
        s.blocking = s.e.blocking || s.cases.some((c) => c.body.some((x) => x.blocking));
        return s;
      }
      case "break":
        if (this.loopDepth === 0 && this.switchDepth === 0) throw err(msg("\"pare\" só pode ser usado dentro de um laço (enquanto, para, faca) ou de um \"escolha\""), s);
        return s;
      case "return": {
        const f = this.curFn!;
        if (s.value) {
          s.value = this.expr(s.value);
          if (f.ret.base === "vazio") throw err(msg("A função \"{name}\" não retorna valor (é \"vazio\"), mas há um \"retorne\" com valor", { name: f.name }), s);
          if (!assignable(f.ret, s.value.t))
            throw err(msg("A função \"{name}\" deve retornar {tipo}, mas está retornando {tipo2}", { name: f.name, tipo: typeName(f.ret), tipo2: typeName(s.value.t) }), s.value);
          s.copy = needsCopy(f.ret, s.value);
          s.blocking = s.value.blocking;
        } else if (f.ret.base !== "vazio") {
          throw err(msg("A função \"{name}\" deve retornar um valor do tipo {tipo}", { name: f.name, tipo: typeName(f.ret) }), s);
        }
        return s;
      }
      case "block":
        if (s.inline) this.stmts(s.body);
        else this.blockScoped(s.body);
        s.blocking = s.body.some((x) => x.blocking);
        return s;
    }
  }

  // ======================= expressões =======================
  private expr(e: A.Expr): A.Expr {
    switch (e.k) {
      case "lit": return e;
      case "arr": throw err(msg("Listas de valores entre chaves só podem ser usadas na declaração de vetores"), e);
      case "var": return this.varRef(e);
      case "index": {
        e.target = this.expr(e.target);
        e.indices = e.indices.map((i) => this.expr(i));
        const tt = e.target.t;
        if (tt.base !== "?") {
          if (tt.dims === 0) throw err(msg("\"{encontrado}\" não é um vetor nem uma matriz, não pode ser indexado com [ ]", { encontrado: this.describe(e.target) }), e);
          if (e.indices.length > tt.dims) throw err(msg("\"{encontrado}\" é um {tipo} e aceita apenas {dims} índice(s)", { encontrado: this.describe(e.target), tipo: typeName(tt), dims: tt.dims }), e);
        }
        for (const i of e.indices) if (i.t.base !== "inteiro" && i.t.base !== "?") throw err(msg("O índice de um vetor deve ser um número inteiro, mas é {tipo}", { tipo: typeName(i.t) }), i);
        e.t = tt.base === "?" ? T_UNK : withDims(tt, tt.dims - e.indices.length);
        e.blocking = e.target.blocking || e.indices.some((i) => i.blocking);
        return e;
      }
      case "member": return this.member(e);
      case "deref": {
        e.e = this.expr(e.e);
        const t = e.e.t;
        if (t.base !== "ref" && t.base !== "?") throw err(msg("\"*\" só pode ser usado em referências (ref), mas \"{encontrado}\" é {tipo}", { encontrado: this.describe(e.e), tipo: typeName(t) }), e);
        e.t = t.elem ?? T_UNK;
        e.blocking = e.e.blocking;
        return e;
      }
      case "addr": {
        const target = this.expr(e.target);
        if (!A.isLValue(target)) throw err(msg("\"&\" só pode ser aplicado a variáveis, posições de vetor ou campos"), e);
        e.target = target;
        if (target.k === "var" && target.isConst) throw err(msg("Não é possível criar uma referência para a constante \"{name}\"", { name: target.name }), e);
        e.t = { base: "ref", dims: 0, elem: target.t };
        e.blocking = target.blocking;
        return e;
      }
      case "un": {
        e.e = this.expr(e.e);
        const t = e.e.t;
        if (e.op === "nao") {
          if (t.base !== "logico" && t.base !== "?") throw err(msg("O operador \"nao\" só pode ser usado com valores lógicos, mas recebeu {tipo}", { tipo: typeName(t) }), e);
          e.t = T("logico");
        } else if (e.op === "-") {
          if (!isNum(t) && t.base !== "?") throw err(msg("O sinal de negativo só pode ser usado com números, mas recebeu {tipo}", { tipo: typeName(t) }), e);
          e.t = t;
        } else {
          if (t.base !== "inteiro" && t.base !== "?") throw err(msg("O operador \"~\" só pode ser usado com inteiros"), e);
          e.t = T("inteiro");
        }
        e.blocking = e.e.blocking;
        return e;
      }
      case "bin": return this.binary(e);
      case "assign": {
        const target = this.expr(e.target);
        if (!A.isLValue(target)) throw err(msg("Só é possível atribuir valores a variáveis, posições de vetores, campos ou referências (*r)"), e);
        e.target = target;
        e.value = this.expr(e.value);
        if (target.k === "var" && target.isConst) throw err(msg("\"{name}\" é uma constante e não pode receber um novo valor", { name: target.name }), e);
        const tt = target.t;
        if (e.op === "=") {
          if (!assignable(tt, e.value.t)) throw err(this.assignMsg(tt, e.value.t, this.describe(target)), e.value);
          e.copy = needsCopy(tt, e.value);
        } else {
          const op = e.op[0];
          const rt = this.binType(op, tt, e.value.t, e);
          if (!assignable(tt, rt)) throw err(msg("O resultado de \"{op}\" seria {tipo}, que não cabe em \"{encontrado}\" ({tipo2})", { op: e.op, tipo: typeName(rt), encontrado: this.describe(target), tipo2: typeName(tt) }), e);
        }
        e.t = tt;
        e.blocking = target.blocking || e.value.blocking;
        return e;
      }
      case "incdec": {
        const target = this.expr(e.target);
        if (!A.isLValue(target)) throw err(msg("\"{op}\" só pode ser usado em variáveis", { op: e.op }), e);
        e.target = target;
        if (target.k === "var" && target.isConst) throw err(msg("\"{name}\" é uma constante e não pode ser alterada", { name: target.name }), e);
        if (!isNum(target.t) && target.t.base !== "?") throw err(msg("\"{op}\" só pode ser usado com números", { op: e.op }), e);
        e.t = target.t;
        e.blocking = target.blocking;
        return e;
      }
      case "call": return this.call(e);
      case "mcall": return this.methodCall(e);
      case "new": return this.construct(e);
    }
  }

  private describe(e: A.Expr): string {
    if (e.k === "var") return e.name;
    if (e.k === "index") return this.describe(e.target) + "[...]";
    if (e.k === "member") return this.describe(e.obj) + "." + e.name;
    if (e.k === "deref") return "*" + this.describe(e.e);
    return msg("expressão");
  }

  /** Alias de biblioteca/módulo usado como objeto (`Matematica.PI`, `Geo.area(...)`)? */
  private aliasOf(e: A.Expr): { lib?: string; mod?: A.ModuleInfo; alias: string } | null {
    if (e.k !== "var" || this.lookup(e.name)) return null;
    if (this.curClass && (this.curClass.fieldIndex.has(e.name))) return null;
    const lib = this.curModule.scope.libAlias.get(e.name);
    if (lib) return { lib, alias: e.name };
    const mod = this.curModule.scope.modAlias.get(e.name);
    if (mod) return { mod, alias: e.name };
    if (LIBS[e.name] && !this.curModule.scope.globals.has(e.name) && !this.lookupGlobal(e.name, e))
      throw err(msg("Para usar a biblioteca {name} é preciso incluí-la no início do programa: inclua biblioteca {name2}", { name: e.name, name2: e.name }), e);
    return null;
  }

  private varRef(e: A.Var): A.Expr {
    const sym = this.lookup(e.name);
    if (sym) {
      e.slot = sym.slot;
      e.global = sym.global;
      e.ref = sym.ref;
      e.t = sym.t;
      e.isConst = sym.isConst;
      return e;
    }
    if (e.name === "este") throw err(msg("\"este\" só pode ser usado dentro de métodos e construtores de uma classe"), e);
    // campo da classe atual (acesso sem "este.")
    if (this.curClass && this.curClass.fieldIndex.has(e.name)) {
      const self: A.Var = { k: "var", line: e.line, col: e.col, file: e.file, blocking: false, name: "este", slot: -1, global: false, ref: false, t: T_UNK, isConst: false };
      return this.member({ k: "member", line: e.line, col: e.col, file: e.file, blocking: false, obj: self, name: e.name, index: -1, t: T_UNK });
    }
    const g = this.lookupGlobal(e.name, e);
    if (g) {
      e.slot = g.slot;
      e.global = true;
      e.ref = false;
      e.t = g.t;
      e.isConst = g.isConst;
      return e;
    }
    if (this.lookupFn(e.name, e) || (this.curClass && this.curClass.methodIndex.has(e.name))) throw err(msg("\"{name}\" é uma função. Para chamá-la use {name2}(...)", { name: e.name, name2: e.name }), e);
    if (this.curModule.scope.libAlias.has(e.name) || LIBS[e.name]) throw err(msg("\"{name}\" é uma biblioteca. Use {name2}.nome_da_funcao(...)", { name: e.name, name2: e.name }), e);
    if (this.curModule.scope.modAlias.has(e.name)) throw err(msg("\"{name}\" é um módulo. Use {name2}.nome(...)", { name: e.name, name2: e.name }), e);
    for (const imp of this.curModule.imports) {
      if (imp.target.scope.globals.has(e.name)) throw err(msg("\"{name}\" é privado no módulo {name2}; declare-o como \"publico\" para usá-lo em outro módulo", { name: e.name, name2: imp.target.name }), e);
    }
    if (this.lookupTypeSoft(e.name)) throw err(msg("\"{name}\" é um tipo. Para criar um valor use {name2}(...)", { name: e.name, name2: e.name }), e);
    const hint = this.suggest(e.name);
    throw err((hint ? msg("A variável \"{name}\" não foi declarada. Você quis dizer \"{hint}\"?", { name: e.name, hint }) : msg("A variável \"{name}\" não foi declarada", { name: e.name })), e);
  }

  private suggest(name: string): string | null {
    const names: string[] = [];
    for (const sc of this.scopes) for (const k of sc.keys()) names.push(k);
    for (const k of this.curModule.scope.globals.keys()) names.push(k);
    if (this.curClass) for (const k of this.curClass.fieldIndex.keys()) names.push(k);
    const lower = name.toLowerCase();
    for (const n of names) if (n.toLowerCase() === lower) return n;
    let best: string | null = null, bestD = 3;
    for (const n of names) {
      const d = lev(lower, n.toLowerCase());
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  private canSeeMember(owner: A.StructDecl | A.ClassDecl, visibility: A.Visibility): boolean {
    if (visibility === "publico" || owner.kind === "struct") return true;
    return !!this.curClass && (this.curClass === owner || this.curClass.ancestors.has(owner as A.ClassDecl));
  }

  private member(e: A.Member): A.Expr {
    const alias = this.aliasOf(e.obj);
    if (alias?.lib) {
      const m = LIBS[alias.lib][e.name];
      if (!m) throw err(msg("A biblioteca {lib} não tem \"{name}\"", { lib: alias.lib, name: e.name }), e);
      if (!("constValue" in m)) throw err(msg("\"{alias}.{name}\" é uma função: use {alias2}.{name2}(...)", { alias: alias.alias, name: e.name, alias2: alias.alias, name2: e.name }), e);
      return { k: "lit", line: e.line, col: e.col, file: e.file, blocking: false, value: m.constValue, t: m.t };
    }
    if (alias?.mod) {
      const g = alias.mod.scope.globals.get(e.name);
      if (!g) {
        if (alias.mod.scope.fns.has(e.name)) throw err(msg("\"{alias}.{name}\" é uma função: use {alias2}.{name2}(...)", { alias: alias.alias, name: e.name, alias2: alias.alias, name2: e.name }), e);
        throw err(msg("O módulo {name} não tem uma variável chamada \"{name2}\"", { name: alias.mod.name, name2: e.name }), e);
      }
      if (!this.visible(g.visibility)) throw err(msg("\"{name}\" é privado no módulo {name2}; declare-o como \"publico\" para usá-lo em outro módulo", { name: e.name, name2: alias.mod.name }), e);
      return { k: "var", line: e.line, col: e.col, file: e.file, blocking: false, name: e.name, slot: g.slot, global: true, ref: false, t: g.t, isConst: g.isConst };
    }
    e.obj = this.expr(e.obj);
    const t = e.obj.t;
    if (t.base === "?") { e.t = T_UNK; return e; }
    if (t.dims > 0) throw err(msg("\"{encontrado}\" é um {tipo}; acesse uma posição com [ ] antes de .{name}", { encontrado: this.describe(e.obj), tipo: typeName(t), name: e.name }), e);
    if (t.base === "ref") throw err(msg("\"{encontrado}\" é uma referência; use (*{encontrado2}).{name}", { encontrado: this.describe(e.obj), encontrado2: this.describe(e.obj), name: e.name }), e);
    if (!isAggregate(t)) throw err(msg("\"{encontrado}\" é {tipo} e não tem campos", { encontrado: this.describe(e.obj), tipo: typeName(t) }), e);
    const decl = t.decl!;
    const idx = decl.fieldIndex.get(e.name);
    if (idx === undefined) {
      if (decl.kind === "class" && decl.methodIndex.has(e.name)) throw err(msg("\"{name}\" é um método de {name2}: use .{name3}(...)", { name: e.name, name2: decl.name, name3: e.name }), e);
      const names = decl.kind === "struct" ? decl.fields.map((f) => f.name) : decl.allFields.map((f) => f.name);
      throw err((decl.kind === "struct"
        ? (names.length ? msg("A estrutura {name} não tem o campo \"{campo}\". Campos: {lista}", { name: decl.name, campo: e.name, lista: names.join(", ") }) : msg("A estrutura {name} não tem o campo \"{campo}\"", { name: decl.name, campo: e.name }))
        : (names.length ? msg("A classe {name} não tem o campo \"{campo}\". Campos: {lista}", { name: decl.name, campo: e.name, lista: names.join(", ") }) : msg("A classe {name} não tem o campo \"{campo}\"", { name: decl.name, campo: e.name }))), e);
    }
    const field = decl.kind === "struct" ? decl.fields[idx] : decl.allFields[idx];
    if (!this.canSeeMember(field.owner, field.visibility))
      throw err(msg("O campo \"{name}\" é privado em {name2} e só pode ser usado dentro da classe (ou das classes que herdam dela)", { name: e.name, name2: field.owner.name }), e);
    e.index = idx;
    e.t = field.t;
    e.blocking = e.obj.blocking;
    return e;
  }

  private resolveLib(alias: string, n: Loc): string {
    const lib = this.curModule.scope.libAlias.get(alias);
    if (lib) return lib;
    if (LIBS[alias]) throw err(msg("Para usar a biblioteca {alias} é preciso incluí-la no início do programa: inclua biblioteca {alias2}", { alias, alias2: alias }), n);
    throw err(msg("A biblioteca \"{alias}\" não existe ou não foi incluída", { alias }), n);
  }

  private binType(op: string, l: TypeRef, r: TypeRef, n: Loc): TypeRef {
    if (l.base === "?" || r.base === "?") {
      if (["==", "!=", "<", ">", "<=", ">=", "e", "ou"].includes(op)) return T("logico");
      return T_UNK;
    }
    if (l.dims > 0 || r.dims > 0) throw err(msg("Não é possível usar o operador \"{op}\" com vetores ou matrizes inteiros; acesse uma posição com [ ]", { op }), n);
    const isStr = (t: TypeRef) => t.base === "cadeia" || t.base === "caracter";
    if (op === "==" || op === "!=") {
      if (l.base === "estrutura" && r.base === "estrutura" && l.decl === r.decl) return T("logico");
      if (l.base === "classe" && r.base === "classe" && (assignable(l, r) || assignable(r, l))) return T("logico");
      if ((l.base === "classe" || l.base === "ref") && r.base === "nulo") return T("logico");
      if ((r.base === "classe" || r.base === "ref") && l.base === "nulo") return T("logico");
      if (l.base === "nulo" && r.base === "nulo") return T("logico");
      if (l.base === "ref" && r.base === "ref") throw err(msg("Não é possível comparar duas referências diretamente; compare os valores apontados com *a {op} *b", { op }), n);
    }
    if (isAggregate(l) || isAggregate(r) || l.base === "ref" || r.base === "ref" || l.base === "nulo" || r.base === "nulo")
      throw err((isAggregate(l) || isAggregate(r)
      ? msg("Não é possível usar o operador \"{op}\" entre {tipo} e {tipo2}; acesse os campos", { op, tipo: typeName(l), tipo2: typeName(r) })
      : msg("Não é possível usar o operador \"{op}\" entre {tipo} e {tipo2}", { op, tipo: typeName(l), tipo2: typeName(r) })), n);
    switch (op) {
      case "+":
        if (l.base === "cadeia" || r.base === "cadeia") return T("cadeia");
        if (isStr(l) && isStr(r)) return T("cadeia");
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        break;
      case "-": case "*": case "/":
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        break;
      case "%": case "<<": case ">>": case "&": case "|": case "^":
        if (l.base === "inteiro" && r.base === "inteiro") return T("inteiro");
        if ((op === "&" || op === "|" || op === "^") && l.base === "logico" && r.base === "logico") return T("logico");
        break;
      case "==": case "!=":
        if (isNum(l) && isNum(r)) return T("logico");
        if (isStr(l) && isStr(r)) return T("logico");
        if (l.base === r.base) return T("logico");
        break;
      case "<": case ">": case "<=": case ">=":
        if (isNum(l) && isNum(r)) return T("logico");
        if (isStr(l) && isStr(r)) return T("logico");
        break;
      case "e": case "ou":
        if (l.base === "logico" && r.base === "logico") return T("logico");
        break;
    }
    throw err(msg("Não é possível usar o operador \"{op}\" entre {tipo} e {tipo2}", { op, tipo: typeName(l), tipo2: typeName(r) }), n);
  }

  private binary(e: A.Bin): A.Expr {
    e.l = this.expr(e.l);
    e.r = this.expr(e.r);
    e.t = this.binType(e.op, e.l.t, e.r.t, e);
    e.blocking = e.l.blocking || e.r.blocking;
    return e;
  }

  /** Verifica argumentos contra os parâmetros de uma função/método do usuário. */
  private checkArgs(fn: A.FuncDecl, params: A.Param[], args: A.Expr[], n: Loc, display: string): boolean[] {
    if (args.length !== params.length)
      throw err(msg("{display} espera {length} parâmetro(s), mas recebeu {length2}", { display, length: params.length, length2: args.length }), n);
    return params.map((p, i) => {
      const a = args[i];
      if (p.ref) {
        if (!A.isLValue(a)) throw err(msg("O parâmetro \"{name}\" é por referência (&) e precisa receber uma variável", { name: p.name }), a);
        if (!same(p.t, a.t) && a.t.base !== "?") throw err(msg("O parâmetro por referência \"{name}\" é {tipo}, mas recebeu {tipo2}", { name: p.name, tipo: typeName(p.t), tipo2: typeName(a.t) }), a);
        return false;
      }
      if (!assignable(p.t, a.t)) throw err(msg("O parâmetro \"{name}\" de {display} é do tipo {tipo}, mas recebeu {tipo2}", { name: p.name, display, tipo: typeName(p.t), tipo2: typeName(a.t) }), a);
      return needsCopy(p.t, a);
    });
    void fn;
  }

  private call(e: A.Call): A.Expr {
    e.args = e.args.map((a) => this.expr(a));
    e.blocking = e.args.some((a) => a.blocking);
    if (e.name.includes(".")) {
      // compatibilidade: nome já qualificado (não gerado pelo parser atual)
      const [alias, member] = e.name.split(".");
      return this.libCall(e, this.resolveLib(alias, e), member, `${alias}.${member}`);
    }
    const gb = GLOBAL_BUILTINS[e.name];
    if (gb) {
      e.builtin = gb;
      this.checkBuiltinArgs(e, gb, e.name);
      if ((e.name === "saida" || e.name === "entrada") && !this.input.tests) throw err(msg("\"{name}\" só pode ser usada em testes (teste \"nome\" { ... })", { name: e.name }), e);
      if (e.name === "leia") {
        if (e.args.length === 0) throw err(msg("\"leia\" precisa de pelo menos uma variável para guardar o valor lido"), e);
        for (const a of e.args) {
          if (!A.isLValue(a)) throw err(msg("\"leia\" só aceita variáveis, posições de vetores, campos ou *referência"), a);
          if (a.t.dims > 0) throw err(msg("\"leia\" não pode ler um vetor inteiro; leia uma posição por vez"), a);
          if (isAggregate(a.t) || a.t.base === "ref") throw err(msg("\"leia\" não pode ler {tipo} de uma vez; leia campo por campo", { tipo: typeName(a.t) }), a);
          if (a.k === "var" && a.isConst) throw err(msg("\"{name}\" é uma constante e não pode receber um valor lido", { name: a.name }), a);
        }
      }
      if (e.name === "escreva") {
        for (const a of e.args) {
          if (a.t.dims > 0) throw err(msg("\"escreva\" não pode escrever um vetor inteiro; escreva uma posição por vez"), a);
          if (a.t.base === "ref") throw err(msg("Para escrever o valor apontado por \"{encontrado}\" use *{encontrado2}", { encontrado: this.describe(a), encontrado2: this.describe(a) }), a);
          if ((a.k === "call" && a.fn && a.fn.ret.base === "vazio") || (a.k === "mcall" && a.t.base === "vazio")) throw err(msg("Essa função não retorna valor e não pode ser escrita"), a);
        }
      }
      return e;
    }
    // método da classe atual chamado sem "este."
    if (this.curClass && this.curClass.methodIndex.has(e.name) && !this.lookup(e.name)) {
      const self: A.Var = { k: "var", line: e.line, col: e.col, file: e.file, blocking: false, name: "este", slot: -1, global: false, ref: false, t: T_UNK, isConst: false };
      const mc: A.MethodCall = { k: "mcall", line: e.line, col: e.col, file: e.file, blocking: false, obj: self, name: e.name, args: e.args, copyArgs: [], method: null, vslot: -1, isSuper: false, initsOf: null, t: T_UNK };
      return this.methodCall(mc, true);
    }
    const fn = this.lookupFn(e.name, e);
    if (!fn) {
      const type = this.lookupTypeSoft(e.name);
      if (type) return this.construct({ k: "new", line: e.line, col: e.col, file: e.file, blocking: false, name: e.name, decl: type, args: e.args, copyArgs: [], t: T_UNK }, true);
      if (this.lookup(e.name)) throw err(msg("\"{name}\" é uma variável, não uma função", { name: e.name }), e);
      for (const imp of this.curModule.imports) {
        if (imp.target.scope.fns.has(e.name)) throw err(msg("A função \"{name}\" é privada no módulo {name2}; declare-a como \"publico\" para usá-la em outro módulo", { name: e.name, name2: imp.target.name }), e);
      }
      for (const lib of Object.keys(LIBS)) {
        if (LIBS[lib][e.name]) throw err(msg("A função \"{name}\" pertence à biblioteca {lib}. Inclua-a com \"inclua biblioteca {lib2}\" e chame {lib3}.{name2}(...)", { name: e.name, lib, lib2: lib, lib3: lib, name2: e.name }), e);
      }
      throw err(msg("A função \"{name}\" não foi declarada", { name: e.name }), e);
    }
    e.fn = fn;
    e.t = fn.ret;
    e.copyArgs = this.checkArgs(fn, fn.params, e.args, e, `A função "${fn.name}"`);
    if (this.curFn) this.calls.get(this.curFn)!.add(fn);
    this.callNodes.push(e);
    return e;
  }

  private libCall(e: A.Call, lib: string, member: string, display: string): A.Expr {
    const m = LIBS[lib][member];
    if (!m) {
      const names = Object.keys(LIBS[lib]).filter((k) => !("constValue" in (LIBS[lib][k] as any)));
      throw err(msg("A biblioteca {lib} não tem a função \"{member}\". Funções disponíveis: {lista}", { lib, member, lista: names.join(", ") }), e);
    }
    if ("constValue" in m) throw err(msg("\"{display}\" é uma constante, não uma função", { display }), e);
    e.builtin = m;
    e.name = `${lib}.${member}`;
    this.checkBuiltinArgs(e, m, display);
    return e;
  }

  private checkBuiltinArgs(e: A.Call, b: A.Builtin, display: string) {
    const min = b.params.length - (b.optional ?? 0);
    if (!b.variadic && (e.args.length < min || e.args.length > b.params.length))
      throw err((min === b.params.length ? msg("A função {display} espera {n} parâmetro(s), mas recebeu {length}", { display, n: min, length: e.args.length }) : msg("A função {display} espera de {min} a {max} parâmetro(s), mas recebeu {length}", { display, min, max: b.params.length, length: e.args.length })), e);
    b.params.forEach((p, i) => {
      if (p === "*" || i >= e.args.length) return;
      const a = e.args[i];
      if (!assignable(p, a.t)) throw err(msg("O parâmetro {v} de {display} deve ser {tipo}, mas recebeu {tipo2}", { v: i + 1, display, tipo: typeName(p), tipo2: typeName(a.t) }), a);
    });
    e.t = b.ret === "arg0" ? (e.args[0]?.t ?? T_UNK) : b.ret;
    if (b.blocking) e.blocking = true;
  }

  private methodCall(e: A.MethodCall, argsResolved = false): A.Expr {
    if (!argsResolved) e.args = e.args.map((a) => this.expr(a));
    const alias = this.aliasOf(e.obj);
    if (alias?.lib) {
      const call: A.Call = { k: "call", line: e.line, col: e.col, file: e.file, blocking: e.args.some((a) => a.blocking), name: e.name, fn: null, builtin: null, args: e.args, copyArgs: [], t: T_UNK };
      return this.libCall(call, alias.lib, e.name, `${alias.alias}.${e.name}`);
    }
    if (alias?.mod) {
      const fn = alias.mod.scope.fns.get(e.name);
      if (!fn) {
        const type = alias.mod.scope.types.get(e.name);
        if (type) {
          if (!this.visible(type.visibility)) throw err(msg("\"{name}\" é privado no módulo {name2}; declare-o como \"publico\" para usá-lo em outro módulo", { name: e.name, name2: alias.mod.name }), e);
          return this.construct({ k: "new", line: e.line, col: e.col, file: e.file, blocking: false, name: e.name, decl: type, args: e.args, copyArgs: [], t: T_UNK }, true);
        }
        throw err(msg("O módulo {name} não tem uma função chamada \"{name2}\"", { name: alias.mod.name, name2: e.name }), e);
      }
      if (!this.visible(fn.visibility)) throw err(msg("A função \"{name}\" é privada no módulo {name2}; declare-a como \"publico\" para usá-la em outro módulo", { name: e.name, name2: alias.mod.name }), e);
      const call: A.Call = { k: "call", line: e.line, col: e.col, file: e.file, blocking: e.args.some((a) => a.blocking), name: e.name, fn, builtin: null, args: e.args, copyArgs: [], t: fn.ret };
      call.copyArgs = this.checkArgs(fn, fn.params, e.args, e, `A função "${alias.alias}.${fn.name}"`);
      if (this.curFn) this.calls.get(this.curFn)!.add(fn);
      this.callNodes.push(call);
      return call;
    }
    if (e.isSuper) {
      if (!this.curClass) throw err(msg("\"super\" só pode ser usado dentro de uma classe"), e);
      const parent = this.curClass.parent;
      e.obj = this.expr(e.obj);
      if (e.name === "<construtor>") {
        if (!this.curFn || !(this.curFn as A.MethodDecl).isCtor) throw err(msg("\"super(...)\" só pode ser usado dentro do construtor"), e);
        e.initsOf = this.curClass;
        if (!parent) {
          if (e.args.length) throw err(msg("A classe {name} não herda de nenhuma classe, então super(...) não recebe argumentos", { name: this.curClass.name }), e);
          e.method = null;
          e.t = T("vazio");
          e.blocking = e.args.some((a) => a.blocking);
          return e;
        }
        const ctor = parent.ctor!;
        e.method = ctor;
        e.copyArgs = this.checkArgs(ctor, ctor.params.slice(1), e.args, e, `O construtor de ${parent.name}`);
        e.t = T("vazio");
        e.blocking = e.args.some((a) => a.blocking);
        if (this.curFn) this.calls.get(this.curFn)!.add(ctor);
        this.callNodes.push(e);
        return e;
      }
      if (!parent) throw err(msg("A classe {name} não herda de nenhuma classe; \"super.{name2}\" não existe", { name: this.curClass.name, name2: e.name }), e);
      const slot = parent.methodIndex.get(e.name);
      if (slot === undefined) throw err(msg("A classe {name} não tem o método \"{name2}\"", { name: parent.name, name2: e.name }), e);
      const m = parent.vtable[slot];
      e.method = m;
      e.vslot = slot;
      e.copyArgs = this.checkArgs(m, m.params.slice(1), e.args, e, `O método "${e.name}"`);
      e.t = m.ret;
      e.blocking = e.args.some((a) => a.blocking);
      if (this.curFn) this.calls.get(this.curFn)!.add(m);
      this.callNodes.push(e);
      return e;
    }
    e.obj = this.expr(e.obj);
    const t = e.obj.t;
    if (t.base === "?") { e.t = T_UNK; return e; }
    if (t.dims > 0) throw err(msg("\"{encontrado}\" é um {tipo}; acesse uma posição com [ ] antes de .{name}(...)", { encontrado: this.describe(e.obj), tipo: typeName(t), name: e.name }), e);
    if (t.base === "estrutura") throw err(msg("{v} é uma estrutura e não tem métodos. Use uma classe para ter métodos", { v: t.decl!.name }), e);
    if (t.base !== "classe") throw err(msg("\"{encontrado}\" é {tipo} e não tem métodos", { encontrado: this.describe(e.obj), tipo: typeName(t) }), e);
    const cls = t.decl as A.ClassDecl;
    const slot = cls.methodIndex.get(e.name);
    if (slot === undefined) {
      if (cls.fieldIndex.has(e.name)) throw err(msg("\"{name}\" é um campo de {name2}, não um método (sem parênteses)", { name: e.name, name2: cls.name }), e);
      if (e.name === cls.name) throw err(msg("O construtor é chamado só na criação do objeto: {name}(...)", { name: cls.name }), e);
      const names = cls.vtable.map((m) => m.name);
      throw err(msg("A classe {name} não tem o método \"{name2}\"{lista}", { name: cls.name, name2: e.name, lista: names.length ? `. Métodos: ${names.join(", ")}` : "" }), e);
    }
    const m = cls.vtable[slot];
    if (!this.canSeeMember(m.cls, m.visibility))
      throw err(msg("O método \"{name}\" é privado em {name2} e só pode ser usado dentro da classe (ou das classes que herdam dela)", { name: e.name, name2: m.cls.name }), e);
    e.method = m;
    e.vslot = slot;
    e.copyArgs = this.checkArgs(m, m.params.slice(1), e.args, e, `O método "${e.name}"`);
    e.t = m.ret;
    e.blocking = e.obj.blocking || e.args.some((a) => a.blocking);
    if (this.curFn) {
      // despacho virtual: qualquer sobrescrita pode ser chamada
      for (const c of this.classes) if (c === cls || c.ancestors.has(cls)) this.calls.get(this.curFn)!.add(c.vtable[slot]);
    }
    this.callNodes.push(e);
    return e;
  }

  private construct(e: A.New, argsResolved = false): A.Expr {
    if (!argsResolved) e.args = e.args.map((a) => this.expr(a));
    const decl = e.decl ?? this.findType(e.name, e);
    e.decl = decl;
    e.blocking = e.args.some((a) => a.blocking);
    if (decl.kind === "struct") {
      if (e.args.length !== 0 && e.args.length !== decl.fields.length)
        throw err(msg("{name}(...) recebe {length} valor(es) ({lista}) ou nenhum, mas recebeu {length2}", { name: decl.name, length: decl.fields.length, lista: decl.fields.map((f) => f.name).join(", "), length2: e.args.length }), e);
      e.copyArgs = e.args.map((a, i) => {
        const f = decl.fields[i];
        if (!assignable(f.t, a.t)) throw err(msg("O campo \"{name}\" de {name2} é {tipo}, mas recebeu {tipo2}", { name: f.name, name2: decl.name, tipo: typeName(f.t), tipo2: typeName(a.t) }), a);
        return needsCopy(f.t, a);
      });
      e.t = { base: "estrutura", dims: 0, name: decl.name, decl };
      return e;
    }
    const ctor = decl.ctor!;
    e.copyArgs = this.checkArgs(ctor, ctor.params.slice(1), e.args, e, `O construtor de ${decl.name}`);
    e.t = { base: "classe", dims: 0, name: decl.name, decl };
    if (this.curFn) this.calls.get(this.curFn)!.add(ctor);
    this.callNodes.push(e);
    return e;
  }

  // ======================= bloqueio =======================
  /** Propaga a marca de bloqueio por chamadas entre funções (ponto fixo) e remarca os nós. */
  private computeBlocking() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [f, callees] of this.calls) {
        if (f.blocking) continue;
        for (const c of callees) if (c.blocking) { f.blocking = true; changed = true; break; }
      }
    }
    const callee = (c: A.Call | A.MethodCall | A.New): boolean => {
      if (c.k === "call") return !!c.fn?.blocking;
      if (c.k === "new") return !!(c.decl as A.ClassDecl).ctor?.blocking;
      if (c.isSuper) return !!c.method?.blocking;
      const cls = c.method!.cls;
      return this.classes.some((k) => (k === cls || k.ancestors.has(cls)) && k.vtable[c.vslot]?.blocking);
    };
    if (this.callNodes.some((c) => callee(c) && !c.blocking)) {
      const all = [...this.allFns, ...this.classes.flatMap((c) => [...c.methods, c.ctor!])];
      for (const f of all) {
        remarkStmts(f.body, this.classes);
        f.blocking = f.blocking || f.body.some((s) => s.blocking);
      }
      for (const g of this.globals) remarkStmts([g], this.classes);
    }
  }
}

function remarkStmts(list: A.Stmt[], classes: A.ClassDecl[]): boolean {
  let any = false;
  for (const s of list) if (remarkStmt(s, classes)) any = true;
  return any;
}
function remarkStmt(s: A.Stmt, classes: A.ClassDecl[]): boolean {
  let b = false;
  const rx = (e: A.Expr) => remarkExpr(e, classes);
  switch (s.k) {
    case "decl": b = !!(s.init && rx(s.init)) || s.sizes.some((x) => !!x && rx(x)); break;
    case "expr": b = rx(s.e); break;
    case "if": b = rx(s.cond); if (remarkStmts(s.then, classes)) b = true; if (s.else && remarkStmts(s.else, classes)) b = true; break;
    case "while": case "dowhile": b = rx(s.cond); if (remarkStmts(s.body, classes)) b = true; break;
    case "for": {
      if (s.init && remarkStmt(s.init, classes)) b = true;
      if (s.cond && rx(s.cond)) b = true;
      if (s.step && rx(s.step)) b = true;
      if (remarkStmts(s.body, classes)) b = true;
      break;
    }
    case "switch": b = rx(s.e); for (const c of s.cases) { if (c.values) for (const v of c.values) if (rx(v)) b = true; if (remarkStmts(c.body, classes)) b = true; } break;
    case "return": b = !!(s.value && rx(s.value)); break;
    case "block": b = remarkStmts(s.body, classes); break;
    case "break": break;
    default: assertNever(s);
  }
  s.blocking = b;
  return b;
}
function remarkExpr(e: A.Expr, classes: A.ClassDecl[]): boolean {
  let b = false;
  const rx = (x: A.Expr) => remarkExpr(x, classes);
  switch (e.k) {
    case "lit": break;
    case "var": break;
    case "index": b = rx(e.target); for (const i of e.indices) if (rx(i)) b = true; break;
    case "member": b = rx(e.obj); break;
    case "deref": b = rx(e.e); break;
    case "addr": b = rx(e.target); break;
    case "bin": b = rx(e.l); if (rx(e.r)) b = true; break;
    case "un": b = rx(e.e); break;
    case "assign": b = rx(e.target); if (rx(e.value)) b = true; break;
    case "incdec": b = rx(e.target); break;
    case "arr": for (const i of e.items) if (rx(i)) b = true; break;
    case "call": for (const a of e.args) if (rx(a)) b = true; if (e.fn?.blocking || e.builtin?.blocking) b = true; break;
    case "new": for (const a of e.args) if (rx(a)) b = true; if (e.decl?.kind === "class" && e.decl.ctor?.blocking) b = true; break;
    case "mcall": {
      b = rx(e.obj);
      for (const a of e.args) if (rx(a)) b = true;
      if (e.isSuper) { if (e.method?.blocking) b = true; }
      else if (e.method) {
        const cls = e.method.cls;
        if (classes.some((k) => (k === cls || k.ancestors.has(cls)) && k.vtable[e.vslot]?.blocking)) b = true;
      }
      break;
    }
    default: assertNever(e);
  }
  e.blocking = b;
  return b;
}

function assertNever(x: never): never {
  throw new Error("nó inesperado: " + JSON.stringify((x as any)?.k));
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}
