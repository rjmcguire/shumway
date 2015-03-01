module Shumway.AVMX {
  import assert = Shumway.Debug.assert;
  import popManyInto = Shumway.ArrayUtilities.popManyInto;

  /**
   * Helps the interpreter allocate fewer Scope objects.
   */
  export class ScopeStack {
    parent: Scope;
    stack: any [];
    isWith: boolean [];
    scopes: Scope [];
    constructor(parent: Scope) {
      this.parent = parent;
      this.stack = [];
      this.isWith = [];
    }

    public push(object: any, isWith: boolean) {
      this.stack.push(object);
      this.isWith.push(!!isWith);
    }

    public get(index): any {
      return this.stack[index];
    }

    public clear() {
      this.stack.length = 0;
      this.isWith.length = 0;
    }

    public pop() {
      this.isWith.pop();
      this.stack.pop();
    }

    public topScope(): Scope {
      if (!this.scopes) {
        this.scopes = [];
      }
      var parent = this.parent;
      for (var i = 0; i < this.stack.length; i++) {
        var object = this.stack[i], isWith = this.isWith[i], scope = this.scopes[i];
        if (!scope || scope.parent !== parent || scope.object !== object || scope.isWith !== isWith) {
          scope = this.scopes[i] = new Scope(parent, object, isWith);
        }
        parent = scope;
      }
      return parent;
    }
  }


  function popNameInto(stack: any [], mn: Multiname, rn: Multiname) {
    rn.id = mn.id;
    rn.kind = mn.kind;
    if (mn.isRuntimeName()) {
      rn.name = stack.pop();
      rn.id = -1;
    } else {
      rn.name = mn.name;
    }
    if (mn.isRuntimeNamespace()) {
      rn.namespaces = [stack.pop()];
      rn.id = -1;
    } else {
      rn.namespaces = mn.namespaces;
    }
    interpreterWriter && interpreterWriter.greenLn("Name: " + rn.name);
  }


  export function interpret(self: Object, methodInfo: MethodInfo, savedScope: Scope, args: any []) {
    interpreterWriter && interpreterWriter.enter("> " + methodInfo);
    try {
      var result = _interpret(self, methodInfo, savedScope, args);
      interpreterWriter && interpreterWriter.leave("< " + methodInfo.trait);
      return result;
    } catch (e) {
      interpreterWriter && interpreterWriter.leave("< " + methodInfo.trait + ", Exception: " + e);
      throw e;
    }
  }

  function _interpret(self: Object, methodInfo: MethodInfo, savedScope: Scope, args: any []) {
    var securityDomain = methodInfo.abc.applicationDomain.securityDomain;

    var abc = methodInfo.abc;
    var body = methodInfo.getBody();
    release || assert(body);

    var local = [self];
    var stack = [];
    var scope = new ScopeStack(savedScope);
    var rn: Multiname = null;

    var argCount = args.length;
    var arg;
    for (var i = 0, j = methodInfo.parameters.length; i < j; i++) {
      var p = methodInfo.parameters[i];
      if (i < argCount) {
        arg = args[i];
      } else if (p.hasOptionalValue()) {
        arg = p.getOptionalValue();
      }
      rn = p.getType();
      if (rn && !rn.isAnyName()) {
        type = scope.topScope().getScopeProperty(rn, true, false);
        interpreterWriter && interpreterWriter.writeLn("Coercing argument to: " + type);
        arg = type.axCoerce(arg);
      }

      local.push(arg);
    }

    var pc = 0;
    function s32(): number {
      var result = code[pc++];
      if (result & 0x80) {
        result = result & 0x7f | code[pc++] << 7;
        if (result & 0x4000) {
          result = result & 0x3fff | code[pc++] << 14;
          if (result & 0x200000) {
            result = result & 0x1fffff | code[pc++] << 21;
            if (result & 0x10000000) {
              result = result & 0x0fffffff | code[pc++] << 28;
              result = result & 0xffffffff;
            }
          }
        }
      }
      return result;
    }

    function u30(): number {
      return s32() >>> 0;
    }

    function u32(): number {
      return s32() >>> 0;
    }

    function s24(): number {
      var u = code[pc++] | (code[pc++] << 8) | (code[pc++] << 16);
      return (u << 8) >> 8;
    }

    rn = new Multiname(abc, 0, null, null, null);

    var code = body.code;
    var value, object, type, a, b, offset, index, result;

    while (true) {
      interpreterWriter && interpreterWriter.greenLn("" + pc + ": " + Bytecode[code[pc]] + " [" + stack.map(x => x == undefined ? String(x) : x.toString()).join(", ") + "]");
      try {
        var bc = code[pc++];
        switch (bc) {
          case Bytecode.LABEL:
            continue;
          case Bytecode.THROW:
            throw stack.pop();
          //case Bytecode.GETSUPER:
          //  popNameInto(stack, multinames[bc.index], mn);
          //  stack.push(stack.pop().asGetSuper (
          //    savedScope, mn.namespaces, mn.name, mn.flags
          //  ));
          //  break;
          //case Bytecode.setsuper:
          //  value = stack.pop();
          //  popNameInto(stack, multinames[bc.index], mn);
          //  stack.pop().asSetSuper (
          //    savedScope, mn.namespaces, mn.name, mn.flags, value
          //  );
          //  break;
          //case Bytecode.kill:
          //  locals[bc.index] = undefined;
          //  break;
          case Bytecode.IFNLT:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = !(a < b) ? pc + offset : pc;
            continue;
          case Bytecode.IFGE:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = a >= b ? pc + offset : pc;
            continue;
          case Bytecode.IFNLE:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = !(a <= b) ? pc + offset : pc;
            continue;
          case Bytecode.IFGT:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = a > b ? pc + offset : pc;
            continue;
          case Bytecode.IFNGT:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = !(a > b) ? pc + offset : pc;
            continue;
          case Bytecode.IFLE:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = a <= b ? pc + offset : pc;
            continue;
          case Bytecode.IFNGE:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = !(a >= b) ? pc + offset : pc;
            continue;
          case Bytecode.IFLT:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = a < b ? pc + offset : pc;
            continue;
          case Bytecode.JUMP:
            pc = s24() + pc;
            continue;
          case Bytecode.IFTRUE:
            offset = s24();
            pc = !!stack.pop() ? pc + offset : pc;
            continue;
          case Bytecode.IFFALSE:
            offset = s24();
            pc = !stack.pop() ? pc + offset : pc;
            continue;
          case Bytecode.IFEQ:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = asEquals(a, b) ? pc + offset : pc;
            continue;
          case Bytecode.IFNE:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = !asEquals(a, b) ? pc + offset : pc;
            continue;
          case Bytecode.IFSTRICTEQ:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = a === b ? pc + offset : pc;
            continue;
          case Bytecode.IFSTRICTNE:
            b = stack.pop();
            a = stack.pop();
            offset = s24();
            pc = a !== b ? pc + offset : pc;
            continue;
          //case Bytecode.lookupswitch:
          //  index = stack.pop();
          //  if (index < 0 || index >= bc.offsets.length) {
          //    index = bc.offsets.length - 1; // The last target is the default.
          //  }
          //  pc = bc.offsets[index];
          //  continue;
          //case Bytecode.pushwith:
          //  scope.push(box(stack.pop()), true);
          //  break;
          case Bytecode.POPSCOPE:
            scope.pop();
            break;
          //case Bytecode.nextname:
          //  index = stack.pop();
          //  stack[stack.length - 1] = box(stack[stack.length - 1]).asNextName(index);
          //  break;
          //case Bytecode.nextvalue:
          //  index = stack.pop();
          //  stack[stack.length - 1] = box(stack[stack.length - 1]).asNextValue(index);
          //  break;
          //case Bytecode.hasnext2:
          //  var hasNext2Info = hasNext2Infos[pc] || (hasNext2Infos[pc] = new HasNext2Info(null, 0));
          //  object = locals[bc.object];
          //  index = locals[bc.index];
          //  hasNext2Info.object = object;
          //  hasNext2Info.index = index;
          //  Object(object).asHasNext2(hasNext2Info);
          //  locals[bc.object] = hasNext2Info.object;
          //  locals[bc.index] = hasNext2Info.index;
          //  stack.push(!!hasNext2Info.index);
          //  break;
          case Bytecode.PUSHNULL:
            stack.push(null);
            break;
          case Bytecode.PUSHUNDEFINED:
            stack.push(undefined);
            break;
          case Bytecode.PUSHBYTE:
            stack.push(code[pc++] << 24 >> 24);
            break;
          case Bytecode.PUSHSHORT:
            stack.push(u30() << 16 >> 16);
            break;
          case Bytecode.PUSHSTRING:
            stack.push(abc.getString(u30()));
            break;
          case Bytecode.PUSHINT:
            stack.push(abc.ints[u30()]);
            break;
          case Bytecode.PUSHUINT:
            stack.push(abc.uints[u30()]);
            break;
          case Bytecode.PUSHDOUBLE:
            stack.push(abc.doubles[u30()]);
            break;
          case Bytecode.PUSHTRUE:
            stack.push(true);
            break;
          case Bytecode.PUSHFALSE:
            stack.push(false);
            break;
          case Bytecode.PUSHNAN:
            stack.push(NaN);
            break;
          case Bytecode.POP:
            stack.pop();
            break;
          case Bytecode.DUP:
            stack.push(stack[stack.length - 1]);
            break;
          case Bytecode.SWAP:
            value = stack[stack.length - 1];
            stack[stack.length - 1] = stack[stack.length - 2];
            stack[stack.length - 2] = value;
            break;
          case Bytecode.PUSHSCOPE:
            scope.push(securityDomain.box(stack.pop()), false);
            break;
          case Bytecode.NEWFUNCTION:
            stack.push(securityDomain.createFunction(abc.getMethodInfo(u30()), scope.topScope(), true));
            break;
          case Bytecode.CALL:
            popManyInto(stack, u30(), args);
            object = stack.pop();
            stack[stack.length - 1] = stack[stack.length - 1].axApply(object, args);
            break;
          case Bytecode.CONSTRUCT:
            popManyInto(stack, u30(), args);
            stack[stack.length - 1] = securityDomain.box(stack[stack.length - 1]).axConstruct(args);
            break;
          case Bytecode.RETURNVOID:
            return;
          case Bytecode.RETURNVALUE:
            if (methodInfo.returnType) {
              // return asCoerceByMultiname(method, method.returnType, stack.pop());
            }
            return stack.pop();
          //case Bytecode.constructsuper:
          //  popManyInto(stack, bc.argCount, args);
          //  object = stack.pop();
          //  savedScope.object.baseClass.instanceConstructorNoInitialize.apply(object, args);
          //  break;
          case Bytecode.CONSTRUCTPROP:
            index = u30();
            argCount = u30();
            popManyInto(stack, argCount, args);
            popNameInto(stack, abc.getMultiname(index), rn);
            stack[stack.length - 1] = securityDomain.box(stack[stack.length - 1]).axConstructProperty(rn, args);
            break;
          //case Bytecode.callsuperid:
          //  Shumway.Debug.notImplemented("Bytecode.callsuperid");
          //  break;
          // case Bytecode.CALLPROPLEX:
          case Bytecode.CALLPROPERTY:
          case Bytecode.CALLPROPVOID:
            index = u30();
            argCount = u30();
            popManyInto(stack, argCount, args);
            popNameInto(stack, abc.getMultiname(index), rn);
            var receiver = stack[stack.length - 1];
            result = securityDomain.box(receiver).axCallProperty(rn, args);
            if (bc === Bytecode.CALLPROPVOID) {
              stack.length--;
            } else {
              stack[stack.length - 1] = result;
            }
            break;
          //case Bytecode.callsuper:
          //case Bytecode.callsupervoid:
          //  popManyInto(stack, bc.argCount, args);
          //  popNameInto(stack, multinames[bc.index], mn);
          //  result = stack.pop().asCallSuper (
          //    savedScope, mn.namespaces, mn.name, mn.flags, args
          //  );
          //  if (op !== Bytecode.callsupervoid) {
          //    stack.push(result);
          //  }
          //  break;
          //case Bytecode.applytype:
          //  popManyInto(stack, bc.argCount, args);
          //  stack[stack.length - 1] = applyType(method, stack[stack.length - 1], args);
          //  break;
          case Bytecode.NEWOBJECT:
            object = securityDomain.AXObject.axConstruct();
            argCount = u30();
            for (var i = 0; i < argCount; i++) {
              value = stack.pop();
              object.axSetPublicProperty(stack.pop(), value);
            }
            stack.push(object);
            break;
          case Bytecode.NEWARRAY:
            object = [];
            popManyInto(stack, u30(), args);
            object.push.apply(object, args);
            stack.push(securityDomain.box(object));
            break;
          case Bytecode.NEWACTIVATION:
            stack.push(securityDomain.createActivation(methodInfo));
            break;
          case Bytecode.NEWCLASS:
            stack[stack.length - 1] = securityDomain.createClass(
              abc.classes[u30()], stack[stack.length - 1], scope.topScope()
            );
            break;
          //case Bytecode.getdescendants:
          //  popNameInto(stack, multinames[bc.index], mn);
          //  if (mn.name === undefined) {
          //    mn.name = '*';
          //  }
          //  stack.push(getDescendants(stack.pop(), mn));
          //  break;
          //case Bytecode.newcatch:
          //  release || assert(exceptions[bc.index].scopeObject);
          //  stack.push(exceptions[bc.index].scopeObject);
          //  break;
          case Bytecode.FINDPROPERTY:
          case Bytecode.FINDPROPSTRICT:
            popNameInto(stack, abc.getMultiname(u30()), rn);
            stack.push(scope.topScope().findScopeProperty(rn, bc === Bytecode.FINDPROPSTRICT, false));
            break;
          //case Bytecode.getlex:
          //  multiname = multinames[bc.index];
          //  object = scope.topScope().findScopeProperty (
          //    multiname.namespaces, multiname.name, multiname.flags, method, true, false
          //  );
          //  stack.push(object.asGetProperty(multiname.namespaces, multiname.name, multiname.flags));
          //  break;
          case Bytecode.INITPROPERTY:
          case Bytecode.SETPROPERTY:
            value = stack.pop();
            popNameInto(stack, abc.getMultiname(u30()), rn);
            securityDomain.box(stack.pop()).axSetProperty(rn, value);
            break;
          case Bytecode.GETLOCAL:
            stack.push(local[u30()]);
            break;
          case Bytecode.SETLOCAL:
            local[u30()] = stack.pop();
            break;
          case Bytecode.GETGLOBALSCOPE:
            stack.push(savedScope.global.object);
            break;
          case Bytecode.GETSCOPEOBJECT:
            stack.push(scope.get(code[pc++]));
            break;
          case Bytecode.GETPROPERTY:
            popNameInto(stack, abc.getMultiname(u30()), rn);
            stack[stack.length - 1] = securityDomain.box(stack[stack.length - 1]).axGetProperty(rn);
            break;
          //case Bytecode.deleteproperty:
          //  popNameInto(stack, multinames[bc.index], mn);
          //  stack[stack.length - 1] = box(stack[stack.length - 1]).asDeleteProperty(mn.namespaces, mn.name, mn.flags);
          //  break;
          case Bytecode.GETSLOT:
            stack[stack.length - 1] = asGetSlot(stack[stack.length - 1], u30());
            break;
          case Bytecode.SETSLOT:
            value = stack.pop();
            object = stack.pop();
            asSetSlot(object, u30(), value);
            break;
          //case Bytecode.convert_s:
          //  stack[stack.length - 1] = asCoerceString(stack[stack.length - 1]);
          //  break;
          //case Bytecode.esc_xattr:
          //  stack[stack.length - 1] = Runtime.escapeXMLAttribute(stack[stack.length - 1]);
          //  break;
          //case Bytecode.esc_xelem:
          //  stack[stack.length - 1] = Runtime.escapeXMLElement(stack[stack.length - 1]);
          //  break;
          case Bytecode.COERCE_I:
          case Bytecode.CONVERT_I:
            stack[stack.length - 1] |= 0;
            break;
          case Bytecode.COERCE_U:
          case Bytecode.CONVERT_U:
            stack[stack.length - 1] >>>= 0;
            break;
          case Bytecode.COERCE_D:
          case Bytecode.CONVERT_D:
            stack[stack.length - 1] = +stack[stack.length - 1];
            break;
          case Bytecode.COERCE_B:
          case Bytecode.CONVERT_B:
            stack[stack.length - 1] = !!stack[stack.length - 1];
            break;
          //case Bytecode.checkfilter:
          //  stack[stack.length - 1] = checkFilter(stack[stack.length - 1]);
          //  break;
          case Bytecode.COERCE:
            popNameInto(stack, abc.getMultiname(u30()), rn);
            type = scope.topScope().getScopeProperty(rn, true, false);
            stack[stack.length - 1] = type.axCoerce(stack[stack.length - 1]);
            break;
          case Bytecode.COERCE_A: /* NOP */
            break;
          //case Bytecode.coerce_s:
          //  stack[stack.length - 1] = asCoerceString(stack[stack.length - 1]);
          //  break;
          case Bytecode.ASTYPE:
            popNameInto(stack, abc.getMultiname(u30()), rn);
            type = scope.topScope().getScopeProperty(rn, true, false);
            stack[stack.length - 2] = type.axAsType(stack[stack.length - 1]);
            break;
          case Bytecode.ASTYPELATE:
            stack[stack.length - 2] = stack.pop().axAsType(stack[stack.length - 1]);
            break;
          case Bytecode.COERCE_O:
            object = stack[stack.length - 1];
            stack[stack.length - 1] = object == undefined ? null : object;
            break;
          case Bytecode.NEGATE:
            stack[stack.length - 1] = -stack[stack.length - 1];
            break;
          case Bytecode.INCREMENT:
            ++stack[stack.length - 1];
            break;
          case Bytecode.INCLOCAL:
            ++(<number []>local)[u30()];
            break;
          case Bytecode.DECREMENT:
            --stack[stack.length - 1];
            break;
          case Bytecode.DECLOCAL:
            --(<number []>local)[u30()];
            break;
          case Bytecode.TYPEOF:
            stack[stack.length - 1] = asTypeOf(stack[stack.length - 1]);
            break;
          case Bytecode.NOT:
            stack[stack.length - 1] = !stack[stack.length - 1];
            break;
          case Bytecode.BITNOT:
            stack[stack.length - 1] = ~stack[stack.length - 1];
            break;
          case Bytecode.ADD:
            stack[stack.length - 2] = asAdd(stack[stack.length - 2], stack.pop());
            break;
          case Bytecode.SUBTRACT:
            stack[stack.length - 2] -= stack.pop();
            break;
          case Bytecode.MULTIPLY:
            stack[stack.length - 2] *= stack.pop();
            break;
          case Bytecode.DIVIDE:
            stack[stack.length - 2] /= stack.pop();
            break;
          case Bytecode.MODULO:
            stack[stack.length - 2] %= stack.pop();
            break;
          case Bytecode.LSHIFT:
            stack[stack.length - 2] <<= stack.pop();
            break;
          case Bytecode.RSHIFT:
            stack[stack.length - 2] >>= stack.pop();
            break;
          case Bytecode.URSHIFT:
            stack[stack.length - 2] >>>= stack.pop();
            break;
          case Bytecode.BITAND:
            stack[stack.length - 2] &= stack.pop();
            break;
          case Bytecode.BITOR:
            stack[stack.length - 2] |= stack.pop();
            break;
          case Bytecode.BITXOR:
            stack[stack.length - 2] ^= stack.pop();
            break;
          case Bytecode.EQUALS:
            stack[stack.length - 2] = asEquals(stack[stack.length - 2], stack.pop());
            break;
          case Bytecode.STRICTEQUALS:
            stack[stack.length - 2] = stack[stack.length - 2] === stack.pop();
            break;
          case Bytecode.LESSTHAN:
            stack[stack.length - 2] = stack[stack.length - 2] < stack.pop();
            break;
          case Bytecode.LESSEQUALS:
            stack[stack.length - 2] = stack[stack.length - 2] <= stack.pop();
            break;
          case Bytecode.GREATERTHAN:
            stack[stack.length - 2] = stack[stack.length - 2] > stack.pop();
            break;
          case Bytecode.GREATEREQUALS:
            stack[stack.length - 2] = stack[stack.length - 2] >= stack.pop();
            break;
          case Bytecode.INSTANCEOF:
            stack[stack.length - 2] = stack.pop().axIsInstanceOf(stack[stack.length - 1]);
            break;
          case Bytecode.ISTYPE:
            popNameInto(stack, abc.getMultiname(u30()), rn);
            type = scope.topScope().findScopeProperty(rn, true, false);
            stack[stack.length - 1] = type.axIsType(stack[stack.length - 1]);
            break;
          case Bytecode.ISTYPELATE:
            stack[stack.length - 2] = stack.pop().axIsType(stack[stack.length - 1]);
            break;
          //case Bytecode.in:
          //  stack[stack.length - 2] = box(stack.pop()).asHasProperty(null, stack[stack.length - 1]);
          //  break;
          case Bytecode.INCREMENT_I:
            stack[stack.length - 1] = (stack[stack.length - 1] | 0) + 1;
            break;
          case Bytecode.DECREMENT_I:
            stack[stack.length - 1] = (stack[stack.length - 1] | 0) - 1;
            break;
          //case Bytecode.inclocal_i:
          //  locals[bc.index] = (locals[bc.index] | 0) + 1;
          //  break;
          //case Bytecode.declocal_i:
          //  locals[bc.index] = (locals[bc.index] | 0) - 1;
          //  break;
          case Bytecode.NEGATE_I:
            // Negation entails casting to int
            stack[stack.length - 1] = ~stack[stack.length - 1];
            break;
          case Bytecode.ADD_I:
            stack[stack.length - 2] = stack[stack.length - 2] + stack.pop() | 0;
            break;
          case Bytecode.SUBTRACT_I:
            stack[stack.length - 2] = stack[stack.length - 2] - stack.pop() | 0;
            break;
          case Bytecode.MULTIPLY_I:
            stack[stack.length - 2] = stack[stack.length - 2] * stack.pop() | 0;
            break;
          case Bytecode.GETLOCAL0:
          case Bytecode.GETLOCAL1:
          case Bytecode.GETLOCAL2:
          case Bytecode.GETLOCAL3:
            stack.push(local[bc - Bytecode.GETLOCAL0]);
            break;
          case Bytecode.SETLOCAL0:
          case Bytecode.SETLOCAL1:
          case Bytecode.SETLOCAL2:
          case Bytecode.SETLOCAL3:
            local[bc - Bytecode.SETLOCAL0] = stack.pop();
            break;
          //case Bytecode.dxns:
          //  Shumway.AVM2.AS.ASXML.defaultNamespace = strings[bc.index];
          //  break;
          //case Bytecode.dxnslate:
          //  Shumway.AVM2.AS.ASXML.defaultNamespace = stack.pop();
          //  break;
          case Bytecode.DEBUG:
            pc ++; u30();
            pc ++; u30();
            break;
          case Bytecode.DEBUGLINE:
          case Bytecode.DEBUGFILE:
            u30();
            break;
          default:
            Debug.notImplemented(Bytecode[bc]);
        }
      } catch (e) {
        interpreterWriter && interpreterWriter.writeLn("Error: " + e);
        interpreterWriter && interpreterWriter.writeLn("Stack: " + e.stack);
        jsGlobal.quit();
      }
    }
  }
}