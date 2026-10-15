import type { components } from "./schema";

// Aliases dos tipos gerados (schema.d.ts). Não redeclare formatos de request/response à mão.
type Schemas = components["schemas"];

export type TokenOut = Schemas["TokenOut"];
export type MeOut = Schemas["MeOut"];
export type UsuarioOut = Schemas["UsuarioOut"];
export type UsuarioPage = Schemas["Page_UsuarioOut_"];
export type UsuarioCriarIn = Schemas["UsuarioCriarIn"];
export type UsuarioEditarIn = Schemas["UsuarioEditarIn"];
export type PapelOut = Schemas["PapelOut"];
export type PapelResumo = Schemas["PapelResumo"];
export type PapelCriarIn = Schemas["PapelCriarIn"];
export type PapelEditarIn = Schemas["PapelEditarIn"];
export type PermissaoOut = Schemas["PermissaoOut"];
export type AuditoriaOut = Schemas["AuditoriaOut"];
export type AuditoriaPage = Schemas["Page_AuditoriaOut_"];
export type ConfiguracaoOut = Schemas["ConfiguracaoOut"];
export type ConfiguracaoEditarIn = Schemas["ConfiguracaoEditarIn"];
export type Empresa = Schemas["EmpresaOut"];
