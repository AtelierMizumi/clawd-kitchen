// Uint8Array base64 methods (TC39, present in the hooks runtime), missing from lib es2023.
interface Uint8Array {
  toBase64(): string
}
interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array
}
