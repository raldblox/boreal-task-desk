// The question a worker's phone answers, built the same way in the browser (to send it) and on
// the server (to check the proofs against it). Safe to import in client code: no secrets, no
// Node APIs.

/** Proofs for one scope give one identifier per document; changing it makes everyone new. */
export const ZKPASSPORT_SCOPE = "boreal.work/worker";

/** The fields of ZKPassport's query builder this question uses. */
interface Builder {
  gte(key: "age", value: number): Builder;
  disclose(key: "nationality" | "firstname" | "lastname" | "birthdate" | "document_type"): Builder;
  facematch(mode: "strict"): Builder;
  bind(key: "custom_data", value: string): Builder;
}

/**
 * 18 or older; nationality; first and last name and birth date (turned into a one-way person code
 * at once, never stored); the document type (ZKPassport needs it to check what's disclosed); a
 * face match on the phone, which the salted unique identifier requires; and the server's one-time
 * nonce, so a proof answers one sign-in only.
 */
export function passportQuery<B extends Builder>(builder: B, nonce: string): B {
  // Every builder method returns the same builder, typed loosely by the SDK.
  return builder
    .gte("age", 18)
    .disclose("nationality")
    .disclose("firstname")
    .disclose("lastname")
    .disclose("birthdate")
    .disclose("document_type")
    .facematch("strict")
    .bind("custom_data", nonce) as B;
}

/** What the browser gets from boreal.work to start a request. */
export interface PassportRequestStart {
  id: string;
  nonce: string;
  domain: string;
  scope: string;
  devMode: boolean;
}
