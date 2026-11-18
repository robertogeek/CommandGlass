/**
 * Lector de CryXmlB, el XML binario de CryEngine que usa Star Citizen dentro de Data.p4k.
 *
 * Cabecera: "CryXmlB\0" + 9 × uint32
 *   fileLength, nodeTableOffset, nodeCount, attrTableOffset, attrCount,
 *   childTableOffset, childCount, stringDataOffset, stringDataSize
 * Nodo (28 bytes): tag, content (offsets de cadena), attrCount u16, childCount u16,
 *   parent i32, firstAttr u32, firstChild u32, reservado u32
 * Atributo (8 bytes): clave, valor (offsets de cadena)
 * Tabla de hijos: uint32 con el índice de cada hijo.
 */

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const MAGIC = 'CryXmlB\0';

export function isCryXml(buf: Buffer): boolean {
  return buf.length > 44 && buf.toString('latin1', 0, 8) === MAGIC;
}

export function parseCryXml(buf: Buffer): XmlNode {
  if (!isCryXml(buf)) throw new Error('No es CryXmlB');
  const u32 = (o: number) => buf.readUInt32LE(o);
  const nodeTable = u32(12);
  const nodeCount = u32(16);
  const attrTable = u32(20);
  const childTable = u32(28);
  const stringData = u32(36);

  const cache = new Map<number, string>();
  const str = (off: number) => {
    let s = cache.get(off);
    if (s === undefined) {
      const start = stringData + off;
      const end = buf.indexOf(0, start);
      s = buf.toString('utf8', start, end < 0 ? buf.length : end);
      cache.set(off, s);
    }
    return s;
  };

  const nodes: XmlNode[] = [];
  const meta: { childCount: number; firstChild: number }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const o = nodeTable + i * 28;
    const attrCount = buf.readUInt16LE(o + 8);
    const firstAttr = u32(o + 16);
    const attrs: Record<string, string> = {};
    for (let a = 0; a < attrCount; a++) {
      const ao = attrTable + (firstAttr + a) * 8;
      attrs[str(u32(ao))] = str(u32(ao + 4));
    }
    nodes.push({ tag: str(u32(o)), text: str(u32(o + 4)), attrs, children: [] });
    meta.push({ childCount: buf.readUInt16LE(o + 10), firstChild: u32(o + 20) });
  }
  for (let i = 0; i < nodeCount; i++) {
    const { childCount, firstChild } = meta[i]!;
    for (let c = 0; c < childCount; c++) {
      const idx = u32(childTable + (firstChild + c) * 4);
      const child = nodes[idx];
      if (child) nodes[i]!.children.push(child);
    }
  }
  if (!nodes[0]) throw new Error('CryXmlB vacío');
  return nodes[0];
}

/** Lector mínimo de XML de texto (los ficheros de perfil del usuario): etiquetas, atributos y jerarquía. */
export function parseTextXml(src: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!m[2]) continue; // comentario o declaración
    const [, closing, tag, rawAttrs, selfClosing] = m;
    if (closing) {
      while (stack.length > 1 && stack.pop()!.tag !== tag) {
        /* cierra hasta encontrar su pareja */
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rawAttrs!.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '');
    }
    const node: XmlNode = { tag: tag!, attrs, children: [], text: '' };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root.children[0] ?? root;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
