// GENERATED FILE — do not edit by hand.
// Source: contracts/song-v2.schema.json (sha256:502d875314fee8de)
// Regenerate: node scripts/build-validator.cjs
// Exports a default function: validate(document) -> boolean, with errors on validate.errors.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// public/js/generated/._validateSongV2.tmp.mjs
var validate = validate20;
var validateSongV2_tmp_default = validate20;
var schema31 = { "$schema": "https://json-schema.org/draft/2020-12/schema", "title": "StagePrompter SongDocument v2", "description": "Documento portable. Schema estructural estricto; requiere adem\xE1s las invariantes sem\xE1nticas de CONTRATO-DATOS.md.", "type": "object", "additionalProperties": false, "required": ["schemaVersion", "id", "metadata", "durationMs", "timing", "audio", "sections", "lines", "chords", "tabs", "sources", "reviewWarnings"], "properties": { "schemaVersion": { "const": 2 }, "id": { "$ref": "#/$defs/id" }, "metadata": { "type": "object", "additionalProperties": false, "required": ["title", "artist", "key", "bpm", "timeSignature"], "properties": { "title": { "type": "string", "minLength": 1, "maxLength": 200 }, "artist": { "type": "string", "maxLength": 200 }, "key": { "anyOf": [{ "type": "string", "pattern": "^[A-G](?:#|b)?m?$" }, { "type": "null" }] }, "bpm": { "type": "number", "exclusiveMinimum": 0 }, "timeSignature": { "type": "object", "additionalProperties": false, "required": ["numerator", "denominator"], "properties": { "numerator": { "type": "integer", "minimum": 1, "maximum": 32 }, "denominator": { "enum": [1, 2, 4, 8, 16, 32] } } } } }, "durationMs": { "type": "integer", "minimum": 1 }, "timing": { "type": "object", "additionalProperties": false, "required": ["status", "method", "notes"], "properties": { "status": { "enum": ["estimated", "reviewed"] }, "method": { "enum": ["grid", "manual", "aligned"] }, "notes": { "type": "string", "maxLength": 4e3 } } }, "audio": { "anyOf": [{ "type": "null" }, { "type": "object", "additionalProperties": false, "required": ["assetId", "offsetMs"], "properties": { "assetId": { "$ref": "#/$defs/id" }, "offsetMs": { "$ref": "#/$defs/timeMs" } } }] }, "sections": { "type": "array", "minItems": 1, "items": { "type": "object", "additionalProperties": false, "required": ["id", "type", "label", "key", "startMs", "endMs"], "properties": { "id": { "$ref": "#/$defs/id" }, "type": { "enum": ["intro", "verse", "prechorus", "chorus", "bridge", "solo", "instrumental", "outro", "other"] }, "label": { "type": "string", "minLength": 1, "maxLength": 80 }, "key": { "anyOf": [{ "type": "string", "pattern": "^[A-G](?:#|b)?m?$" }, { "type": "null" }] }, "startMs": { "$ref": "#/$defs/timeMs" }, "endMs": { "$ref": "#/$defs/timeMs" } } } }, "lines": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "sectionId", "startMs", "endMs", "text", "tokens"], "properties": { "id": { "$ref": "#/$defs/id" }, "sectionId": { "$ref": "#/$defs/id" }, "startMs": { "$ref": "#/$defs/timeMs" }, "endMs": { "$ref": "#/$defs/timeMs" }, "text": { "type": "string", "minLength": 1, "maxLength": 2e3 }, "tokens": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["text", "startMs", "endMs", "charStart", "charEnd"], "properties": { "text": { "type": "string", "minLength": 1, "maxLength": 2e3 }, "startMs": { "$ref": "#/$defs/timeMs" }, "endMs": { "$ref": "#/$defs/timeMs" }, "charStart": { "type": "integer", "minimum": 0 }, "charEnd": { "type": "integer", "minimum": 1 } } } } } } }, "chords": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "startMs", "endMs", "symbol", "bassNote", "anchor", "scale"], "properties": { "id": { "$ref": "#/$defs/id" }, "startMs": { "$ref": "#/$defs/timeMs" }, "endMs": { "$ref": "#/$defs/timeMs" }, "symbol": { "type": "string", "minLength": 1, "maxLength": 64, "pattern": "^[^\\s\\u0000-\\u001f]+$" }, "bassNote": { "anyOf": [{ "$ref": "#/$defs/note" }, { "type": "null" }] }, "anchor": { "anyOf": [{ "type": "null" }, { "type": "object", "additionalProperties": false, "required": ["lineId", "charOffset"], "properties": { "lineId": { "$ref": "#/$defs/id" }, "charOffset": { "type": "integer", "minimum": 0 } } }] }, "scale": { "anyOf": [{ "type": "null" }, { "type": "object", "additionalProperties": false, "required": ["root", "id"], "properties": { "root": { "$ref": "#/$defs/note" }, "id": { "$ref": "#/$defs/scaleId" } } }] } } } }, "tabs": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "sectionId", "startMs", "endMs", "label", "ascii"], "properties": { "id": { "$ref": "#/$defs/id" }, "sectionId": { "$ref": "#/$defs/id" }, "startMs": { "$ref": "#/$defs/timeMs" }, "endMs": { "$ref": "#/$defs/timeMs" }, "label": { "type": "string", "minLength": 1, "maxLength": 120 }, "ascii": { "type": "string", "minLength": 1, "maxLength": 2e4 } } } }, "sources": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["url", "title", "retrievedAt"], "properties": { "url": { "type": "string", "format": "uri", "pattern": "^https?://", "maxLength": 2048 }, "title": { "type": "string", "maxLength": 300 }, "retrievedAt": { "anyOf": [{ "type": "string", "format": "date-time" }, { "type": "null" }] } } } }, "reviewWarnings": { "type": "array", "uniqueItems": true, "items": { "type": "string", "minLength": 1, "maxLength": 2e3 } } }, "$defs": { "id": { "type": "string", "minLength": 1, "maxLength": 100, "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, "timeMs": { "type": "integer", "minimum": 0 }, "note": { "type": "string", "pattern": "^[A-G](?:#|b)?$" }, "scaleId": { "type": "string", "minLength": 1, "maxLength": 80, "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" } } };
var func1 = Object.prototype.hasOwnProperty;
var func2 = require_ucs2length().default;
var pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]*$", "u");
var pattern5 = new RegExp("^[A-G](?:#|b)?m?$", "u");
var pattern12 = new RegExp("^[^\\s\\u0000-\\u001f]+$", "u");
var pattern13 = new RegExp("^[A-G](?:#|b)?$", "u");
var pattern16 = new RegExp("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", "u");
var pattern19 = new RegExp("^https?://", "u");
var formats0 = /^[a-z][a-z0-9+.-]*:\S*$/i;
var formats2 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d{1,9})?([Zz]|[+-]\d{2}:\d{2})$/;
function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.schemaVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.id === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.metadata === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "metadata" }, message: "must have required property 'metadata'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.durationMs === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "durationMs" }, message: "must have required property 'durationMs'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.timing === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "timing" }, message: "must have required property 'timing'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.audio === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "audio" }, message: "must have required property 'audio'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.sections === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sections" }, message: "must have required property 'sections'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.lines === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "lines" }, message: "must have required property 'lines'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.chords === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "chords" }, message: "must have required property 'chords'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.tabs === void 0) {
      const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tabs" }, message: "must have required property 'tabs'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.sources === void 0) {
      const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sources" }, message: "must have required property 'sources'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.reviewWarnings === void 0) {
      const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reviewWarnings" }, message: "must have required property 'reviewWarnings'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema31.properties, key0)) {
        const err12 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.schemaVersion !== void 0) {
      if (2 !== data.schemaVersion) {
        const err13 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/const", keyword: "const", params: { allowedValue: 2 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data1 = data.id;
      if (typeof data1 === "string") {
        if (func2(data1) > 100) {
          const err14 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (func2(data1) < 1) {
          const err15 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (!pattern4.test(data1)) {
          const err16 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = { instancePath: instancePath + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.metadata !== void 0) {
      let data2 = data.metadata;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.title === void 0) {
          const err18 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data2.artist === void 0) {
          const err19 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/required", keyword: "required", params: { missingProperty: "artist" }, message: "must have required property 'artist'" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (data2.key === void 0) {
          const err20 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/required", keyword: "required", params: { missingProperty: "key" }, message: "must have required property 'key'" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        if (data2.bpm === void 0) {
          const err21 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/required", keyword: "required", params: { missingProperty: "bpm" }, message: "must have required property 'bpm'" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        if (data2.timeSignature === void 0) {
          const err22 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/required", keyword: "required", params: { missingProperty: "timeSignature" }, message: "must have required property 'timeSignature'" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        for (const key1 in data2) {
          if (!(key1 === "title" || key1 === "artist" || key1 === "key" || key1 === "bpm" || key1 === "timeSignature")) {
            const err23 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data2.title !== void 0) {
          let data3 = data2.title;
          if (typeof data3 === "string") {
            if (func2(data3) > 200) {
              const err24 = { instancePath: instancePath + "/metadata/title", schemaPath: "#/properties/metadata/properties/title/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (func2(data3) < 1) {
              const err25 = { instancePath: instancePath + "/metadata/title", schemaPath: "#/properties/metadata/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          } else {
            const err26 = { instancePath: instancePath + "/metadata/title", schemaPath: "#/properties/metadata/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data2.artist !== void 0) {
          let data4 = data2.artist;
          if (typeof data4 === "string") {
            if (func2(data4) > 200) {
              const err27 = { instancePath: instancePath + "/metadata/artist", schemaPath: "#/properties/metadata/properties/artist/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          } else {
            const err28 = { instancePath: instancePath + "/metadata/artist", schemaPath: "#/properties/metadata/properties/artist/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data2.key !== void 0) {
          let data5 = data2.key;
          const _errs14 = errors;
          let valid3 = false;
          const _errs15 = errors;
          if (typeof data5 === "string") {
            if (!pattern5.test(data5)) {
              const err29 = { instancePath: instancePath + "/metadata/key", schemaPath: "#/properties/metadata/properties/key/anyOf/0/pattern", keyword: "pattern", params: { pattern: "^[A-G](?:#|b)?m?$" }, message: 'must match pattern "^[A-G](?:#|b)?m?$"' };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          } else {
            const err30 = { instancePath: instancePath + "/metadata/key", schemaPath: "#/properties/metadata/properties/key/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          var _valid0 = _errs15 === errors;
          valid3 = valid3 || _valid0;
          const _errs17 = errors;
          if (data5 !== null) {
            const err31 = { instancePath: instancePath + "/metadata/key", schemaPath: "#/properties/metadata/properties/key/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
          var _valid0 = _errs17 === errors;
          valid3 = valid3 || _valid0;
          if (!valid3) {
            const err32 = { instancePath: instancePath + "/metadata/key", schemaPath: "#/properties/metadata/properties/key/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          } else {
            errors = _errs14;
            if (vErrors !== null) {
              if (_errs14) {
                vErrors.length = _errs14;
              } else {
                vErrors = null;
              }
            }
          }
        }
        if (data2.bpm !== void 0) {
          let data6 = data2.bpm;
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 <= 0 || isNaN(data6)) {
              const err33 = { instancePath: instancePath + "/metadata/bpm", schemaPath: "#/properties/metadata/properties/bpm/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          } else {
            const err34 = { instancePath: instancePath + "/metadata/bpm", schemaPath: "#/properties/metadata/properties/bpm/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data2.timeSignature !== void 0) {
          let data7 = data2.timeSignature;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.numerator === void 0) {
              const err35 = { instancePath: instancePath + "/metadata/timeSignature", schemaPath: "#/properties/metadata/properties/timeSignature/required", keyword: "required", params: { missingProperty: "numerator" }, message: "must have required property 'numerator'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            if (data7.denominator === void 0) {
              const err36 = { instancePath: instancePath + "/metadata/timeSignature", schemaPath: "#/properties/metadata/properties/timeSignature/required", keyword: "required", params: { missingProperty: "denominator" }, message: "must have required property 'denominator'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            for (const key2 in data7) {
              if (!(key2 === "numerator" || key2 === "denominator")) {
                const err37 = { instancePath: instancePath + "/metadata/timeSignature", schemaPath: "#/properties/metadata/properties/timeSignature/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
            if (data7.numerator !== void 0) {
              let data8 = data7.numerator;
              if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
                const err38 = { instancePath: instancePath + "/metadata/timeSignature/numerator", schemaPath: "#/properties/metadata/properties/timeSignature/properties/numerator/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
              if (typeof data8 == "number" && isFinite(data8)) {
                if (data8 > 32 || isNaN(data8)) {
                  const err39 = { instancePath: instancePath + "/metadata/timeSignature/numerator", schemaPath: "#/properties/metadata/properties/timeSignature/properties/numerator/maximum", keyword: "maximum", params: { comparison: "<=", limit: 32 }, message: "must be <= 32" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                if (data8 < 1 || isNaN(data8)) {
                  const err40 = { instancePath: instancePath + "/metadata/timeSignature/numerator", schemaPath: "#/properties/metadata/properties/timeSignature/properties/numerator/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
              }
            }
            if (data7.denominator !== void 0) {
              let data9 = data7.denominator;
              if (!(data9 === 1 || data9 === 2 || data9 === 4 || data9 === 8 || data9 === 16 || data9 === 32)) {
                const err41 = { instancePath: instancePath + "/metadata/timeSignature/denominator", schemaPath: "#/properties/metadata/properties/timeSignature/properties/denominator/enum", keyword: "enum", params: { allowedValues: schema31.properties.metadata.properties.timeSignature.properties.denominator.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
          } else {
            const err42 = { instancePath: instancePath + "/metadata/timeSignature", schemaPath: "#/properties/metadata/properties/timeSignature/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
      } else {
        const err43 = { instancePath: instancePath + "/metadata", schemaPath: "#/properties/metadata/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err43];
        } else {
          vErrors.push(err43);
        }
        errors++;
      }
    }
    if (data.durationMs !== void 0) {
      let data10 = data.durationMs;
      if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
        const err44 = { instancePath: instancePath + "/durationMs", schemaPath: "#/properties/durationMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err44];
        } else {
          vErrors.push(err44);
        }
        errors++;
      }
      if (typeof data10 == "number" && isFinite(data10)) {
        if (data10 < 1 || isNaN(data10)) {
          const err45 = { instancePath: instancePath + "/durationMs", schemaPath: "#/properties/durationMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err45];
          } else {
            vErrors.push(err45);
          }
          errors++;
        }
      }
    }
    if (data.timing !== void 0) {
      let data11 = data.timing;
      if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
        if (data11.status === void 0) {
          const err46 = { instancePath: instancePath + "/timing", schemaPath: "#/properties/timing/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err46];
          } else {
            vErrors.push(err46);
          }
          errors++;
        }
        if (data11.method === void 0) {
          const err47 = { instancePath: instancePath + "/timing", schemaPath: "#/properties/timing/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err47];
          } else {
            vErrors.push(err47);
          }
          errors++;
        }
        if (data11.notes === void 0) {
          const err48 = { instancePath: instancePath + "/timing", schemaPath: "#/properties/timing/required", keyword: "required", params: { missingProperty: "notes" }, message: "must have required property 'notes'" };
          if (vErrors === null) {
            vErrors = [err48];
          } else {
            vErrors.push(err48);
          }
          errors++;
        }
        for (const key3 in data11) {
          if (!(key3 === "status" || key3 === "method" || key3 === "notes")) {
            const err49 = { instancePath: instancePath + "/timing", schemaPath: "#/properties/timing/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
        if (data11.status !== void 0) {
          let data12 = data11.status;
          if (!(data12 === "estimated" || data12 === "reviewed")) {
            const err50 = { instancePath: instancePath + "/timing/status", schemaPath: "#/properties/timing/properties/status/enum", keyword: "enum", params: { allowedValues: schema31.properties.timing.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err50];
            } else {
              vErrors.push(err50);
            }
            errors++;
          }
        }
        if (data11.method !== void 0) {
          let data13 = data11.method;
          if (!(data13 === "grid" || data13 === "manual" || data13 === "aligned")) {
            const err51 = { instancePath: instancePath + "/timing/method", schemaPath: "#/properties/timing/properties/method/enum", keyword: "enum", params: { allowedValues: schema31.properties.timing.properties.method.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
        }
        if (data11.notes !== void 0) {
          let data14 = data11.notes;
          if (typeof data14 === "string") {
            if (func2(data14) > 4e3) {
              const err52 = { instancePath: instancePath + "/timing/notes", schemaPath: "#/properties/timing/properties/notes/maxLength", keyword: "maxLength", params: { limit: 4e3 }, message: "must NOT have more than 4000 characters" };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          } else {
            const err53 = { instancePath: instancePath + "/timing/notes", schemaPath: "#/properties/timing/properties/notes/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
      } else {
        const err54 = { instancePath: instancePath + "/timing", schemaPath: "#/properties/timing/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
    if (data.audio !== void 0) {
      let data15 = data.audio;
      const _errs37 = errors;
      let valid6 = false;
      const _errs38 = errors;
      if (data15 !== null) {
        const err55 = { instancePath: instancePath + "/audio", schemaPath: "#/properties/audio/anyOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err55];
        } else {
          vErrors.push(err55);
        }
        errors++;
      }
      var _valid1 = _errs38 === errors;
      valid6 = valid6 || _valid1;
      const _errs40 = errors;
      if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
        if (data15.assetId === void 0) {
          const err56 = { instancePath: instancePath + "/audio", schemaPath: "#/properties/audio/anyOf/1/required", keyword: "required", params: { missingProperty: "assetId" }, message: "must have required property 'assetId'" };
          if (vErrors === null) {
            vErrors = [err56];
          } else {
            vErrors.push(err56);
          }
          errors++;
        }
        if (data15.offsetMs === void 0) {
          const err57 = { instancePath: instancePath + "/audio", schemaPath: "#/properties/audio/anyOf/1/required", keyword: "required", params: { missingProperty: "offsetMs" }, message: "must have required property 'offsetMs'" };
          if (vErrors === null) {
            vErrors = [err57];
          } else {
            vErrors.push(err57);
          }
          errors++;
        }
        for (const key4 in data15) {
          if (!(key4 === "assetId" || key4 === "offsetMs")) {
            const err58 = { instancePath: instancePath + "/audio", schemaPath: "#/properties/audio/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
        if (data15.assetId !== void 0) {
          let data16 = data15.assetId;
          if (typeof data16 === "string") {
            if (func2(data16) > 100) {
              const err59 = { instancePath: instancePath + "/audio/assetId", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
              if (vErrors === null) {
                vErrors = [err59];
              } else {
                vErrors.push(err59);
              }
              errors++;
            }
            if (func2(data16) < 1) {
              const err60 = { instancePath: instancePath + "/audio/assetId", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
            if (!pattern4.test(data16)) {
              const err61 = { instancePath: instancePath + "/audio/assetId", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
              if (vErrors === null) {
                vErrors = [err61];
              } else {
                vErrors.push(err61);
              }
              errors++;
            }
          } else {
            const err62 = { instancePath: instancePath + "/audio/assetId", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err62];
            } else {
              vErrors.push(err62);
            }
            errors++;
          }
        }
        if (data15.offsetMs !== void 0) {
          let data17 = data15.offsetMs;
          if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17))) {
            const err63 = { instancePath: instancePath + "/audio/offsetMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err63];
            } else {
              vErrors.push(err63);
            }
            errors++;
          }
          if (typeof data17 == "number" && isFinite(data17)) {
            if (data17 < 0 || isNaN(data17)) {
              const err64 = { instancePath: instancePath + "/audio/offsetMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err64];
              } else {
                vErrors.push(err64);
              }
              errors++;
            }
          }
        }
      } else {
        const err65 = { instancePath: instancePath + "/audio", schemaPath: "#/properties/audio/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
      var _valid1 = _errs40 === errors;
      valid6 = valid6 || _valid1;
      if (!valid6) {
        const err66 = { instancePath: instancePath + "/audio", schemaPath: "#/properties/audio/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err66];
        } else {
          vErrors.push(err66);
        }
        errors++;
      } else {
        errors = _errs37;
        if (vErrors !== null) {
          if (_errs37) {
            vErrors.length = _errs37;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.sections !== void 0) {
      let data18 = data.sections;
      if (Array.isArray(data18)) {
        if (data18.length < 1) {
          const err67 = { instancePath: instancePath + "/sections", schemaPath: "#/properties/sections/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err67];
          } else {
            vErrors.push(err67);
          }
          errors++;
        }
        const len0 = data18.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data19 = data18[i0];
          if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
            if (data19.id === void 0) {
              const err68 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err68];
              } else {
                vErrors.push(err68);
              }
              errors++;
            }
            if (data19.type === void 0) {
              const err69 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err69];
              } else {
                vErrors.push(err69);
              }
              errors++;
            }
            if (data19.label === void 0) {
              const err70 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
              if (vErrors === null) {
                vErrors = [err70];
              } else {
                vErrors.push(err70);
              }
              errors++;
            }
            if (data19.key === void 0) {
              const err71 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/required", keyword: "required", params: { missingProperty: "key" }, message: "must have required property 'key'" };
              if (vErrors === null) {
                vErrors = [err71];
              } else {
                vErrors.push(err71);
              }
              errors++;
            }
            if (data19.startMs === void 0) {
              const err72 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/required", keyword: "required", params: { missingProperty: "startMs" }, message: "must have required property 'startMs'" };
              if (vErrors === null) {
                vErrors = [err72];
              } else {
                vErrors.push(err72);
              }
              errors++;
            }
            if (data19.endMs === void 0) {
              const err73 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/required", keyword: "required", params: { missingProperty: "endMs" }, message: "must have required property 'endMs'" };
              if (vErrors === null) {
                vErrors = [err73];
              } else {
                vErrors.push(err73);
              }
              errors++;
            }
            for (const key5 in data19) {
              if (!(key5 === "id" || key5 === "type" || key5 === "label" || key5 === "key" || key5 === "startMs" || key5 === "endMs")) {
                const err74 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err74];
                } else {
                  vErrors.push(err74);
                }
                errors++;
              }
            }
            if (data19.id !== void 0) {
              let data20 = data19.id;
              if (typeof data20 === "string") {
                if (func2(data20) > 100) {
                  const err75 = { instancePath: instancePath + "/sections/" + i0 + "/id", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err75];
                  } else {
                    vErrors.push(err75);
                  }
                  errors++;
                }
                if (func2(data20) < 1) {
                  const err76 = { instancePath: instancePath + "/sections/" + i0 + "/id", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err76];
                  } else {
                    vErrors.push(err76);
                  }
                  errors++;
                }
                if (!pattern4.test(data20)) {
                  const err77 = { instancePath: instancePath + "/sections/" + i0 + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                  if (vErrors === null) {
                    vErrors = [err77];
                  } else {
                    vErrors.push(err77);
                  }
                  errors++;
                }
              } else {
                const err78 = { instancePath: instancePath + "/sections/" + i0 + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err78];
                } else {
                  vErrors.push(err78);
                }
                errors++;
              }
            }
            if (data19.type !== void 0) {
              let data21 = data19.type;
              if (!(data21 === "intro" || data21 === "verse" || data21 === "prechorus" || data21 === "chorus" || data21 === "bridge" || data21 === "solo" || data21 === "instrumental" || data21 === "outro" || data21 === "other")) {
                const err79 = { instancePath: instancePath + "/sections/" + i0 + "/type", schemaPath: "#/properties/sections/items/properties/type/enum", keyword: "enum", params: { allowedValues: schema31.properties.sections.items.properties.type.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err79];
                } else {
                  vErrors.push(err79);
                }
                errors++;
              }
            }
            if (data19.label !== void 0) {
              let data22 = data19.label;
              if (typeof data22 === "string") {
                if (func2(data22) > 80) {
                  const err80 = { instancePath: instancePath + "/sections/" + i0 + "/label", schemaPath: "#/properties/sections/items/properties/label/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
                  if (vErrors === null) {
                    vErrors = [err80];
                  } else {
                    vErrors.push(err80);
                  }
                  errors++;
                }
                if (func2(data22) < 1) {
                  const err81 = { instancePath: instancePath + "/sections/" + i0 + "/label", schemaPath: "#/properties/sections/items/properties/label/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err81];
                  } else {
                    vErrors.push(err81);
                  }
                  errors++;
                }
              } else {
                const err82 = { instancePath: instancePath + "/sections/" + i0 + "/label", schemaPath: "#/properties/sections/items/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err82];
                } else {
                  vErrors.push(err82);
                }
                errors++;
              }
            }
            if (data19.key !== void 0) {
              let data23 = data19.key;
              const _errs61 = errors;
              let valid14 = false;
              const _errs62 = errors;
              if (typeof data23 === "string") {
                if (!pattern5.test(data23)) {
                  const err83 = { instancePath: instancePath + "/sections/" + i0 + "/key", schemaPath: "#/properties/sections/items/properties/key/anyOf/0/pattern", keyword: "pattern", params: { pattern: "^[A-G](?:#|b)?m?$" }, message: 'must match pattern "^[A-G](?:#|b)?m?$"' };
                  if (vErrors === null) {
                    vErrors = [err83];
                  } else {
                    vErrors.push(err83);
                  }
                  errors++;
                }
              } else {
                const err84 = { instancePath: instancePath + "/sections/" + i0 + "/key", schemaPath: "#/properties/sections/items/properties/key/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err84];
                } else {
                  vErrors.push(err84);
                }
                errors++;
              }
              var _valid2 = _errs62 === errors;
              valid14 = valid14 || _valid2;
              const _errs64 = errors;
              if (data23 !== null) {
                const err85 = { instancePath: instancePath + "/sections/" + i0 + "/key", schemaPath: "#/properties/sections/items/properties/key/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err85];
                } else {
                  vErrors.push(err85);
                }
                errors++;
              }
              var _valid2 = _errs64 === errors;
              valid14 = valid14 || _valid2;
              if (!valid14) {
                const err86 = { instancePath: instancePath + "/sections/" + i0 + "/key", schemaPath: "#/properties/sections/items/properties/key/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err86];
                } else {
                  vErrors.push(err86);
                }
                errors++;
              } else {
                errors = _errs61;
                if (vErrors !== null) {
                  if (_errs61) {
                    vErrors.length = _errs61;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data19.startMs !== void 0) {
              let data24 = data19.startMs;
              if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
                const err87 = { instancePath: instancePath + "/sections/" + i0 + "/startMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err87];
                } else {
                  vErrors.push(err87);
                }
                errors++;
              }
              if (typeof data24 == "number" && isFinite(data24)) {
                if (data24 < 0 || isNaN(data24)) {
                  const err88 = { instancePath: instancePath + "/sections/" + i0 + "/startMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err88];
                  } else {
                    vErrors.push(err88);
                  }
                  errors++;
                }
              }
            }
            if (data19.endMs !== void 0) {
              let data25 = data19.endMs;
              if (!(typeof data25 == "number" && (!(data25 % 1) && !isNaN(data25)) && isFinite(data25))) {
                const err89 = { instancePath: instancePath + "/sections/" + i0 + "/endMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err89];
                } else {
                  vErrors.push(err89);
                }
                errors++;
              }
              if (typeof data25 == "number" && isFinite(data25)) {
                if (data25 < 0 || isNaN(data25)) {
                  const err90 = { instancePath: instancePath + "/sections/" + i0 + "/endMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err90];
                  } else {
                    vErrors.push(err90);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err91 = { instancePath: instancePath + "/sections/" + i0, schemaPath: "#/properties/sections/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err91];
            } else {
              vErrors.push(err91);
            }
            errors++;
          }
        }
      } else {
        const err92 = { instancePath: instancePath + "/sections", schemaPath: "#/properties/sections/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err92];
        } else {
          vErrors.push(err92);
        }
        errors++;
      }
    }
    if (data.lines !== void 0) {
      let data26 = data.lines;
      if (Array.isArray(data26)) {
        const len1 = data26.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data27 = data26[i1];
          if (data27 && typeof data27 == "object" && !Array.isArray(data27)) {
            if (data27.id === void 0) {
              const err93 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err93];
              } else {
                vErrors.push(err93);
              }
              errors++;
            }
            if (data27.sectionId === void 0) {
              const err94 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/required", keyword: "required", params: { missingProperty: "sectionId" }, message: "must have required property 'sectionId'" };
              if (vErrors === null) {
                vErrors = [err94];
              } else {
                vErrors.push(err94);
              }
              errors++;
            }
            if (data27.startMs === void 0) {
              const err95 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/required", keyword: "required", params: { missingProperty: "startMs" }, message: "must have required property 'startMs'" };
              if (vErrors === null) {
                vErrors = [err95];
              } else {
                vErrors.push(err95);
              }
              errors++;
            }
            if (data27.endMs === void 0) {
              const err96 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/required", keyword: "required", params: { missingProperty: "endMs" }, message: "must have required property 'endMs'" };
              if (vErrors === null) {
                vErrors = [err96];
              } else {
                vErrors.push(err96);
              }
              errors++;
            }
            if (data27.text === void 0) {
              const err97 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
              if (vErrors === null) {
                vErrors = [err97];
              } else {
                vErrors.push(err97);
              }
              errors++;
            }
            if (data27.tokens === void 0) {
              const err98 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/required", keyword: "required", params: { missingProperty: "tokens" }, message: "must have required property 'tokens'" };
              if (vErrors === null) {
                vErrors = [err98];
              } else {
                vErrors.push(err98);
              }
              errors++;
            }
            for (const key6 in data27) {
              if (!(key6 === "id" || key6 === "sectionId" || key6 === "startMs" || key6 === "endMs" || key6 === "text" || key6 === "tokens")) {
                const err99 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err99];
                } else {
                  vErrors.push(err99);
                }
                errors++;
              }
            }
            if (data27.id !== void 0) {
              let data28 = data27.id;
              if (typeof data28 === "string") {
                if (func2(data28) > 100) {
                  const err100 = { instancePath: instancePath + "/lines/" + i1 + "/id", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err100];
                  } else {
                    vErrors.push(err100);
                  }
                  errors++;
                }
                if (func2(data28) < 1) {
                  const err101 = { instancePath: instancePath + "/lines/" + i1 + "/id", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err101];
                  } else {
                    vErrors.push(err101);
                  }
                  errors++;
                }
                if (!pattern4.test(data28)) {
                  const err102 = { instancePath: instancePath + "/lines/" + i1 + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                  if (vErrors === null) {
                    vErrors = [err102];
                  } else {
                    vErrors.push(err102);
                  }
                  errors++;
                }
              } else {
                const err103 = { instancePath: instancePath + "/lines/" + i1 + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err103];
                } else {
                  vErrors.push(err103);
                }
                errors++;
              }
            }
            if (data27.sectionId !== void 0) {
              let data29 = data27.sectionId;
              if (typeof data29 === "string") {
                if (func2(data29) > 100) {
                  const err104 = { instancePath: instancePath + "/lines/" + i1 + "/sectionId", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err104];
                  } else {
                    vErrors.push(err104);
                  }
                  errors++;
                }
                if (func2(data29) < 1) {
                  const err105 = { instancePath: instancePath + "/lines/" + i1 + "/sectionId", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err105];
                  } else {
                    vErrors.push(err105);
                  }
                  errors++;
                }
                if (!pattern4.test(data29)) {
                  const err106 = { instancePath: instancePath + "/lines/" + i1 + "/sectionId", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                  if (vErrors === null) {
                    vErrors = [err106];
                  } else {
                    vErrors.push(err106);
                  }
                  errors++;
                }
              } else {
                const err107 = { instancePath: instancePath + "/lines/" + i1 + "/sectionId", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err107];
                } else {
                  vErrors.push(err107);
                }
                errors++;
              }
            }
            if (data27.startMs !== void 0) {
              let data30 = data27.startMs;
              if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30))) {
                const err108 = { instancePath: instancePath + "/lines/" + i1 + "/startMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err108];
                } else {
                  vErrors.push(err108);
                }
                errors++;
              }
              if (typeof data30 == "number" && isFinite(data30)) {
                if (data30 < 0 || isNaN(data30)) {
                  const err109 = { instancePath: instancePath + "/lines/" + i1 + "/startMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err109];
                  } else {
                    vErrors.push(err109);
                  }
                  errors++;
                }
              }
            }
            if (data27.endMs !== void 0) {
              let data31 = data27.endMs;
              if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31))) {
                const err110 = { instancePath: instancePath + "/lines/" + i1 + "/endMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err110];
                } else {
                  vErrors.push(err110);
                }
                errors++;
              }
              if (typeof data31 == "number" && isFinite(data31)) {
                if (data31 < 0 || isNaN(data31)) {
                  const err111 = { instancePath: instancePath + "/lines/" + i1 + "/endMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err111];
                  } else {
                    vErrors.push(err111);
                  }
                  errors++;
                }
              }
            }
            if (data27.text !== void 0) {
              let data32 = data27.text;
              if (typeof data32 === "string") {
                if (func2(data32) > 2e3) {
                  const err112 = { instancePath: instancePath + "/lines/" + i1 + "/text", schemaPath: "#/properties/lines/items/properties/text/maxLength", keyword: "maxLength", params: { limit: 2e3 }, message: "must NOT have more than 2000 characters" };
                  if (vErrors === null) {
                    vErrors = [err112];
                  } else {
                    vErrors.push(err112);
                  }
                  errors++;
                }
                if (func2(data32) < 1) {
                  const err113 = { instancePath: instancePath + "/lines/" + i1 + "/text", schemaPath: "#/properties/lines/items/properties/text/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err113];
                  } else {
                    vErrors.push(err113);
                  }
                  errors++;
                }
              } else {
                const err114 = { instancePath: instancePath + "/lines/" + i1 + "/text", schemaPath: "#/properties/lines/items/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err114];
                } else {
                  vErrors.push(err114);
                }
                errors++;
              }
            }
            if (data27.tokens !== void 0) {
              let data33 = data27.tokens;
              if (Array.isArray(data33)) {
                const len2 = data33.length;
                for (let i2 = 0; i2 < len2; i2++) {
                  let data34 = data33[i2];
                  if (data34 && typeof data34 == "object" && !Array.isArray(data34)) {
                    if (data34.text === void 0) {
                      const err115 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
                      if (vErrors === null) {
                        vErrors = [err115];
                      } else {
                        vErrors.push(err115);
                      }
                      errors++;
                    }
                    if (data34.startMs === void 0) {
                      const err116 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/required", keyword: "required", params: { missingProperty: "startMs" }, message: "must have required property 'startMs'" };
                      if (vErrors === null) {
                        vErrors = [err116];
                      } else {
                        vErrors.push(err116);
                      }
                      errors++;
                    }
                    if (data34.endMs === void 0) {
                      const err117 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/required", keyword: "required", params: { missingProperty: "endMs" }, message: "must have required property 'endMs'" };
                      if (vErrors === null) {
                        vErrors = [err117];
                      } else {
                        vErrors.push(err117);
                      }
                      errors++;
                    }
                    if (data34.charStart === void 0) {
                      const err118 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/required", keyword: "required", params: { missingProperty: "charStart" }, message: "must have required property 'charStart'" };
                      if (vErrors === null) {
                        vErrors = [err118];
                      } else {
                        vErrors.push(err118);
                      }
                      errors++;
                    }
                    if (data34.charEnd === void 0) {
                      const err119 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/required", keyword: "required", params: { missingProperty: "charEnd" }, message: "must have required property 'charEnd'" };
                      if (vErrors === null) {
                        vErrors = [err119];
                      } else {
                        vErrors.push(err119);
                      }
                      errors++;
                    }
                    for (const key7 in data34) {
                      if (!(key7 === "text" || key7 === "startMs" || key7 === "endMs" || key7 === "charStart" || key7 === "charEnd")) {
                        const err120 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err120];
                        } else {
                          vErrors.push(err120);
                        }
                        errors++;
                      }
                    }
                    if (data34.text !== void 0) {
                      let data35 = data34.text;
                      if (typeof data35 === "string") {
                        if (func2(data35) > 2e3) {
                          const err121 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/text", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/text/maxLength", keyword: "maxLength", params: { limit: 2e3 }, message: "must NOT have more than 2000 characters" };
                          if (vErrors === null) {
                            vErrors = [err121];
                          } else {
                            vErrors.push(err121);
                          }
                          errors++;
                        }
                        if (func2(data35) < 1) {
                          const err122 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/text", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/text/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                          if (vErrors === null) {
                            vErrors = [err122];
                          } else {
                            vErrors.push(err122);
                          }
                          errors++;
                        }
                      } else {
                        const err123 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/text", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err123];
                        } else {
                          vErrors.push(err123);
                        }
                        errors++;
                      }
                    }
                    if (data34.startMs !== void 0) {
                      let data36 = data34.startMs;
                      if (!(typeof data36 == "number" && (!(data36 % 1) && !isNaN(data36)) && isFinite(data36))) {
                        const err124 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/startMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err124];
                        } else {
                          vErrors.push(err124);
                        }
                        errors++;
                      }
                      if (typeof data36 == "number" && isFinite(data36)) {
                        if (data36 < 0 || isNaN(data36)) {
                          const err125 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/startMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err125];
                          } else {
                            vErrors.push(err125);
                          }
                          errors++;
                        }
                      }
                    }
                    if (data34.endMs !== void 0) {
                      let data37 = data34.endMs;
                      if (!(typeof data37 == "number" && (!(data37 % 1) && !isNaN(data37)) && isFinite(data37))) {
                        const err126 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/endMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err126];
                        } else {
                          vErrors.push(err126);
                        }
                        errors++;
                      }
                      if (typeof data37 == "number" && isFinite(data37)) {
                        if (data37 < 0 || isNaN(data37)) {
                          const err127 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/endMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err127];
                          } else {
                            vErrors.push(err127);
                          }
                          errors++;
                        }
                      }
                    }
                    if (data34.charStart !== void 0) {
                      let data38 = data34.charStart;
                      if (!(typeof data38 == "number" && (!(data38 % 1) && !isNaN(data38)) && isFinite(data38))) {
                        const err128 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/charStart", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/charStart/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err128];
                        } else {
                          vErrors.push(err128);
                        }
                        errors++;
                      }
                      if (typeof data38 == "number" && isFinite(data38)) {
                        if (data38 < 0 || isNaN(data38)) {
                          const err129 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/charStart", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/charStart/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err129];
                          } else {
                            vErrors.push(err129);
                          }
                          errors++;
                        }
                      }
                    }
                    if (data34.charEnd !== void 0) {
                      let data39 = data34.charEnd;
                      if (!(typeof data39 == "number" && (!(data39 % 1) && !isNaN(data39)) && isFinite(data39))) {
                        const err130 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/charEnd", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/charEnd/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err130];
                        } else {
                          vErrors.push(err130);
                        }
                        errors++;
                      }
                      if (typeof data39 == "number" && isFinite(data39)) {
                        if (data39 < 1 || isNaN(data39)) {
                          const err131 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2 + "/charEnd", schemaPath: "#/properties/lines/items/properties/tokens/items/properties/charEnd/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                          if (vErrors === null) {
                            vErrors = [err131];
                          } else {
                            vErrors.push(err131);
                          }
                          errors++;
                        }
                      }
                    }
                  } else {
                    const err132 = { instancePath: instancePath + "/lines/" + i1 + "/tokens/" + i2, schemaPath: "#/properties/lines/items/properties/tokens/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err132];
                    } else {
                      vErrors.push(err132);
                    }
                    errors++;
                  }
                }
              } else {
                const err133 = { instancePath: instancePath + "/lines/" + i1 + "/tokens", schemaPath: "#/properties/lines/items/properties/tokens/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err133];
                } else {
                  vErrors.push(err133);
                }
                errors++;
              }
            }
          } else {
            const err134 = { instancePath: instancePath + "/lines/" + i1, schemaPath: "#/properties/lines/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err134];
            } else {
              vErrors.push(err134);
            }
            errors++;
          }
        }
      } else {
        const err135 = { instancePath: instancePath + "/lines", schemaPath: "#/properties/lines/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err135];
        } else {
          vErrors.push(err135);
        }
        errors++;
      }
    }
    if (data.chords !== void 0) {
      let data40 = data.chords;
      if (Array.isArray(data40)) {
        const len3 = data40.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data41 = data40[i3];
          if (data41 && typeof data41 == "object" && !Array.isArray(data41)) {
            if (data41.id === void 0) {
              const err136 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err136];
              } else {
                vErrors.push(err136);
              }
              errors++;
            }
            if (data41.startMs === void 0) {
              const err137 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "startMs" }, message: "must have required property 'startMs'" };
              if (vErrors === null) {
                vErrors = [err137];
              } else {
                vErrors.push(err137);
              }
              errors++;
            }
            if (data41.endMs === void 0) {
              const err138 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "endMs" }, message: "must have required property 'endMs'" };
              if (vErrors === null) {
                vErrors = [err138];
              } else {
                vErrors.push(err138);
              }
              errors++;
            }
            if (data41.symbol === void 0) {
              const err139 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "symbol" }, message: "must have required property 'symbol'" };
              if (vErrors === null) {
                vErrors = [err139];
              } else {
                vErrors.push(err139);
              }
              errors++;
            }
            if (data41.bassNote === void 0) {
              const err140 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "bassNote" }, message: "must have required property 'bassNote'" };
              if (vErrors === null) {
                vErrors = [err140];
              } else {
                vErrors.push(err140);
              }
              errors++;
            }
            if (data41.anchor === void 0) {
              const err141 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "anchor" }, message: "must have required property 'anchor'" };
              if (vErrors === null) {
                vErrors = [err141];
              } else {
                vErrors.push(err141);
              }
              errors++;
            }
            if (data41.scale === void 0) {
              const err142 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/required", keyword: "required", params: { missingProperty: "scale" }, message: "must have required property 'scale'" };
              if (vErrors === null) {
                vErrors = [err142];
              } else {
                vErrors.push(err142);
              }
              errors++;
            }
            for (const key8 in data41) {
              if (!(key8 === "id" || key8 === "startMs" || key8 === "endMs" || key8 === "symbol" || key8 === "bassNote" || key8 === "anchor" || key8 === "scale")) {
                const err143 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err143];
                } else {
                  vErrors.push(err143);
                }
                errors++;
              }
            }
            if (data41.id !== void 0) {
              let data42 = data41.id;
              if (typeof data42 === "string") {
                if (func2(data42) > 100) {
                  const err144 = { instancePath: instancePath + "/chords/" + i3 + "/id", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err144];
                  } else {
                    vErrors.push(err144);
                  }
                  errors++;
                }
                if (func2(data42) < 1) {
                  const err145 = { instancePath: instancePath + "/chords/" + i3 + "/id", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err145];
                  } else {
                    vErrors.push(err145);
                  }
                  errors++;
                }
                if (!pattern4.test(data42)) {
                  const err146 = { instancePath: instancePath + "/chords/" + i3 + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                  if (vErrors === null) {
                    vErrors = [err146];
                  } else {
                    vErrors.push(err146);
                  }
                  errors++;
                }
              } else {
                const err147 = { instancePath: instancePath + "/chords/" + i3 + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err147];
                } else {
                  vErrors.push(err147);
                }
                errors++;
              }
            }
            if (data41.startMs !== void 0) {
              let data43 = data41.startMs;
              if (!(typeof data43 == "number" && (!(data43 % 1) && !isNaN(data43)) && isFinite(data43))) {
                const err148 = { instancePath: instancePath + "/chords/" + i3 + "/startMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err148];
                } else {
                  vErrors.push(err148);
                }
                errors++;
              }
              if (typeof data43 == "number" && isFinite(data43)) {
                if (data43 < 0 || isNaN(data43)) {
                  const err149 = { instancePath: instancePath + "/chords/" + i3 + "/startMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err149];
                  } else {
                    vErrors.push(err149);
                  }
                  errors++;
                }
              }
            }
            if (data41.endMs !== void 0) {
              let data44 = data41.endMs;
              if (!(typeof data44 == "number" && (!(data44 % 1) && !isNaN(data44)) && isFinite(data44))) {
                const err150 = { instancePath: instancePath + "/chords/" + i3 + "/endMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err150];
                } else {
                  vErrors.push(err150);
                }
                errors++;
              }
              if (typeof data44 == "number" && isFinite(data44)) {
                if (data44 < 0 || isNaN(data44)) {
                  const err151 = { instancePath: instancePath + "/chords/" + i3 + "/endMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err151];
                  } else {
                    vErrors.push(err151);
                  }
                  errors++;
                }
              }
            }
            if (data41.symbol !== void 0) {
              let data45 = data41.symbol;
              if (typeof data45 === "string") {
                if (func2(data45) > 64) {
                  const err152 = { instancePath: instancePath + "/chords/" + i3 + "/symbol", schemaPath: "#/properties/chords/items/properties/symbol/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
                  if (vErrors === null) {
                    vErrors = [err152];
                  } else {
                    vErrors.push(err152);
                  }
                  errors++;
                }
                if (func2(data45) < 1) {
                  const err153 = { instancePath: instancePath + "/chords/" + i3 + "/symbol", schemaPath: "#/properties/chords/items/properties/symbol/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err153];
                  } else {
                    vErrors.push(err153);
                  }
                  errors++;
                }
                if (!pattern12.test(data45)) {
                  const err154 = { instancePath: instancePath + "/chords/" + i3 + "/symbol", schemaPath: "#/properties/chords/items/properties/symbol/pattern", keyword: "pattern", params: { pattern: "^[^\\s\\u0000-\\u001f]+$" }, message: 'must match pattern "^[^\\s\\u0000-\\u001f]+$"' };
                  if (vErrors === null) {
                    vErrors = [err154];
                  } else {
                    vErrors.push(err154);
                  }
                  errors++;
                }
              } else {
                const err155 = { instancePath: instancePath + "/chords/" + i3 + "/symbol", schemaPath: "#/properties/chords/items/properties/symbol/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err155];
                } else {
                  vErrors.push(err155);
                }
                errors++;
              }
            }
            if (data41.bassNote !== void 0) {
              let data46 = data41.bassNote;
              const _errs125 = errors;
              let valid35 = false;
              const _errs126 = errors;
              if (typeof data46 === "string") {
                if (!pattern13.test(data46)) {
                  const err156 = { instancePath: instancePath + "/chords/" + i3 + "/bassNote", schemaPath: "#/$defs/note/pattern", keyword: "pattern", params: { pattern: "^[A-G](?:#|b)?$" }, message: 'must match pattern "^[A-G](?:#|b)?$"' };
                  if (vErrors === null) {
                    vErrors = [err156];
                  } else {
                    vErrors.push(err156);
                  }
                  errors++;
                }
              } else {
                const err157 = { instancePath: instancePath + "/chords/" + i3 + "/bassNote", schemaPath: "#/$defs/note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err157];
                } else {
                  vErrors.push(err157);
                }
                errors++;
              }
              var _valid3 = _errs126 === errors;
              valid35 = valid35 || _valid3;
              const _errs129 = errors;
              if (data46 !== null) {
                const err158 = { instancePath: instancePath + "/chords/" + i3 + "/bassNote", schemaPath: "#/properties/chords/items/properties/bassNote/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err158];
                } else {
                  vErrors.push(err158);
                }
                errors++;
              }
              var _valid3 = _errs129 === errors;
              valid35 = valid35 || _valid3;
              if (!valid35) {
                const err159 = { instancePath: instancePath + "/chords/" + i3 + "/bassNote", schemaPath: "#/properties/chords/items/properties/bassNote/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err159];
                } else {
                  vErrors.push(err159);
                }
                errors++;
              } else {
                errors = _errs125;
                if (vErrors !== null) {
                  if (_errs125) {
                    vErrors.length = _errs125;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data41.anchor !== void 0) {
              let data47 = data41.anchor;
              const _errs132 = errors;
              let valid37 = false;
              const _errs133 = errors;
              if (data47 !== null) {
                const err160 = { instancePath: instancePath + "/chords/" + i3 + "/anchor", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err160];
                } else {
                  vErrors.push(err160);
                }
                errors++;
              }
              var _valid4 = _errs133 === errors;
              valid37 = valid37 || _valid4;
              const _errs135 = errors;
              if (data47 && typeof data47 == "object" && !Array.isArray(data47)) {
                if (data47.lineId === void 0) {
                  const err161 = { instancePath: instancePath + "/chords/" + i3 + "/anchor", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/1/required", keyword: "required", params: { missingProperty: "lineId" }, message: "must have required property 'lineId'" };
                  if (vErrors === null) {
                    vErrors = [err161];
                  } else {
                    vErrors.push(err161);
                  }
                  errors++;
                }
                if (data47.charOffset === void 0) {
                  const err162 = { instancePath: instancePath + "/chords/" + i3 + "/anchor", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/1/required", keyword: "required", params: { missingProperty: "charOffset" }, message: "must have required property 'charOffset'" };
                  if (vErrors === null) {
                    vErrors = [err162];
                  } else {
                    vErrors.push(err162);
                  }
                  errors++;
                }
                for (const key9 in data47) {
                  if (!(key9 === "lineId" || key9 === "charOffset")) {
                    const err163 = { instancePath: instancePath + "/chords/" + i3 + "/anchor", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err163];
                    } else {
                      vErrors.push(err163);
                    }
                    errors++;
                  }
                }
                if (data47.lineId !== void 0) {
                  let data48 = data47.lineId;
                  if (typeof data48 === "string") {
                    if (func2(data48) > 100) {
                      const err164 = { instancePath: instancePath + "/chords/" + i3 + "/anchor/lineId", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                      if (vErrors === null) {
                        vErrors = [err164];
                      } else {
                        vErrors.push(err164);
                      }
                      errors++;
                    }
                    if (func2(data48) < 1) {
                      const err165 = { instancePath: instancePath + "/chords/" + i3 + "/anchor/lineId", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err165];
                      } else {
                        vErrors.push(err165);
                      }
                      errors++;
                    }
                    if (!pattern4.test(data48)) {
                      const err166 = { instancePath: instancePath + "/chords/" + i3 + "/anchor/lineId", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                      if (vErrors === null) {
                        vErrors = [err166];
                      } else {
                        vErrors.push(err166);
                      }
                      errors++;
                    }
                  } else {
                    const err167 = { instancePath: instancePath + "/chords/" + i3 + "/anchor/lineId", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err167];
                    } else {
                      vErrors.push(err167);
                    }
                    errors++;
                  }
                }
                if (data47.charOffset !== void 0) {
                  let data49 = data47.charOffset;
                  if (!(typeof data49 == "number" && (!(data49 % 1) && !isNaN(data49)) && isFinite(data49))) {
                    const err168 = { instancePath: instancePath + "/chords/" + i3 + "/anchor/charOffset", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/1/properties/charOffset/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err168];
                    } else {
                      vErrors.push(err168);
                    }
                    errors++;
                  }
                  if (typeof data49 == "number" && isFinite(data49)) {
                    if (data49 < 0 || isNaN(data49)) {
                      const err169 = { instancePath: instancePath + "/chords/" + i3 + "/anchor/charOffset", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/1/properties/charOffset/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err169];
                      } else {
                        vErrors.push(err169);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err170 = { instancePath: instancePath + "/chords/" + i3 + "/anchor", schemaPath: "#/properties/chords/items/properties/anchor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err170];
                } else {
                  vErrors.push(err170);
                }
                errors++;
              }
              var _valid4 = _errs135 === errors;
              valid37 = valid37 || _valid4;
              if (!valid37) {
                const err171 = { instancePath: instancePath + "/chords/" + i3 + "/anchor", schemaPath: "#/properties/chords/items/properties/anchor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err171];
                } else {
                  vErrors.push(err171);
                }
                errors++;
              } else {
                errors = _errs132;
                if (vErrors !== null) {
                  if (_errs132) {
                    vErrors.length = _errs132;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data41.scale !== void 0) {
              let data50 = data41.scale;
              const _errs144 = errors;
              let valid40 = false;
              const _errs145 = errors;
              if (data50 !== null) {
                const err172 = { instancePath: instancePath + "/chords/" + i3 + "/scale", schemaPath: "#/properties/chords/items/properties/scale/anyOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err172];
                } else {
                  vErrors.push(err172);
                }
                errors++;
              }
              var _valid5 = _errs145 === errors;
              valid40 = valid40 || _valid5;
              const _errs147 = errors;
              if (data50 && typeof data50 == "object" && !Array.isArray(data50)) {
                if (data50.root === void 0) {
                  const err173 = { instancePath: instancePath + "/chords/" + i3 + "/scale", schemaPath: "#/properties/chords/items/properties/scale/anyOf/1/required", keyword: "required", params: { missingProperty: "root" }, message: "must have required property 'root'" };
                  if (vErrors === null) {
                    vErrors = [err173];
                  } else {
                    vErrors.push(err173);
                  }
                  errors++;
                }
                if (data50.id === void 0) {
                  const err174 = { instancePath: instancePath + "/chords/" + i3 + "/scale", schemaPath: "#/properties/chords/items/properties/scale/anyOf/1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err174];
                  } else {
                    vErrors.push(err174);
                  }
                  errors++;
                }
                for (const key10 in data50) {
                  if (!(key10 === "root" || key10 === "id")) {
                    const err175 = { instancePath: instancePath + "/chords/" + i3 + "/scale", schemaPath: "#/properties/chords/items/properties/scale/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err175];
                    } else {
                      vErrors.push(err175);
                    }
                    errors++;
                  }
                }
                if (data50.root !== void 0) {
                  let data51 = data50.root;
                  if (typeof data51 === "string") {
                    if (!pattern13.test(data51)) {
                      const err176 = { instancePath: instancePath + "/chords/" + i3 + "/scale/root", schemaPath: "#/$defs/note/pattern", keyword: "pattern", params: { pattern: "^[A-G](?:#|b)?$" }, message: 'must match pattern "^[A-G](?:#|b)?$"' };
                      if (vErrors === null) {
                        vErrors = [err176];
                      } else {
                        vErrors.push(err176);
                      }
                      errors++;
                    }
                  } else {
                    const err177 = { instancePath: instancePath + "/chords/" + i3 + "/scale/root", schemaPath: "#/$defs/note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err177];
                    } else {
                      vErrors.push(err177);
                    }
                    errors++;
                  }
                }
                if (data50.id !== void 0) {
                  let data52 = data50.id;
                  if (typeof data52 === "string") {
                    if (func2(data52) > 80) {
                      const err178 = { instancePath: instancePath + "/chords/" + i3 + "/scale/id", schemaPath: "#/$defs/scaleId/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
                      if (vErrors === null) {
                        vErrors = [err178];
                      } else {
                        vErrors.push(err178);
                      }
                      errors++;
                    }
                    if (func2(data52) < 1) {
                      const err179 = { instancePath: instancePath + "/chords/" + i3 + "/scale/id", schemaPath: "#/$defs/scaleId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                      if (vErrors === null) {
                        vErrors = [err179];
                      } else {
                        vErrors.push(err179);
                      }
                      errors++;
                    }
                    if (!pattern16.test(data52)) {
                      const err180 = { instancePath: instancePath + "/chords/" + i3 + "/scale/id", schemaPath: "#/$defs/scaleId/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" }, message: 'must match pattern "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"' };
                      if (vErrors === null) {
                        vErrors = [err180];
                      } else {
                        vErrors.push(err180);
                      }
                      errors++;
                    }
                  } else {
                    const err181 = { instancePath: instancePath + "/chords/" + i3 + "/scale/id", schemaPath: "#/$defs/scaleId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err181];
                    } else {
                      vErrors.push(err181);
                    }
                    errors++;
                  }
                }
              } else {
                const err182 = { instancePath: instancePath + "/chords/" + i3 + "/scale", schemaPath: "#/properties/chords/items/properties/scale/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err182];
                } else {
                  vErrors.push(err182);
                }
                errors++;
              }
              var _valid5 = _errs147 === errors;
              valid40 = valid40 || _valid5;
              if (!valid40) {
                const err183 = { instancePath: instancePath + "/chords/" + i3 + "/scale", schemaPath: "#/properties/chords/items/properties/scale/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err183];
                } else {
                  vErrors.push(err183);
                }
                errors++;
              } else {
                errors = _errs144;
                if (vErrors !== null) {
                  if (_errs144) {
                    vErrors.length = _errs144;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err184 = { instancePath: instancePath + "/chords/" + i3, schemaPath: "#/properties/chords/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err184];
            } else {
              vErrors.push(err184);
            }
            errors++;
          }
        }
      } else {
        const err185 = { instancePath: instancePath + "/chords", schemaPath: "#/properties/chords/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err185];
        } else {
          vErrors.push(err185);
        }
        errors++;
      }
    }
    if (data.tabs !== void 0) {
      let data53 = data.tabs;
      if (Array.isArray(data53)) {
        const len4 = data53.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data54 = data53[i4];
          if (data54 && typeof data54 == "object" && !Array.isArray(data54)) {
            if (data54.id === void 0) {
              const err186 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err186];
              } else {
                vErrors.push(err186);
              }
              errors++;
            }
            if (data54.sectionId === void 0) {
              const err187 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/required", keyword: "required", params: { missingProperty: "sectionId" }, message: "must have required property 'sectionId'" };
              if (vErrors === null) {
                vErrors = [err187];
              } else {
                vErrors.push(err187);
              }
              errors++;
            }
            if (data54.startMs === void 0) {
              const err188 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/required", keyword: "required", params: { missingProperty: "startMs" }, message: "must have required property 'startMs'" };
              if (vErrors === null) {
                vErrors = [err188];
              } else {
                vErrors.push(err188);
              }
              errors++;
            }
            if (data54.endMs === void 0) {
              const err189 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/required", keyword: "required", params: { missingProperty: "endMs" }, message: "must have required property 'endMs'" };
              if (vErrors === null) {
                vErrors = [err189];
              } else {
                vErrors.push(err189);
              }
              errors++;
            }
            if (data54.label === void 0) {
              const err190 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
              if (vErrors === null) {
                vErrors = [err190];
              } else {
                vErrors.push(err190);
              }
              errors++;
            }
            if (data54.ascii === void 0) {
              const err191 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/required", keyword: "required", params: { missingProperty: "ascii" }, message: "must have required property 'ascii'" };
              if (vErrors === null) {
                vErrors = [err191];
              } else {
                vErrors.push(err191);
              }
              errors++;
            }
            for (const key11 in data54) {
              if (!(key11 === "id" || key11 === "sectionId" || key11 === "startMs" || key11 === "endMs" || key11 === "label" || key11 === "ascii")) {
                const err192 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err192];
                } else {
                  vErrors.push(err192);
                }
                errors++;
              }
            }
            if (data54.id !== void 0) {
              let data55 = data54.id;
              if (typeof data55 === "string") {
                if (func2(data55) > 100) {
                  const err193 = { instancePath: instancePath + "/tabs/" + i4 + "/id", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err193];
                  } else {
                    vErrors.push(err193);
                  }
                  errors++;
                }
                if (func2(data55) < 1) {
                  const err194 = { instancePath: instancePath + "/tabs/" + i4 + "/id", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err194];
                  } else {
                    vErrors.push(err194);
                  }
                  errors++;
                }
                if (!pattern4.test(data55)) {
                  const err195 = { instancePath: instancePath + "/tabs/" + i4 + "/id", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                  if (vErrors === null) {
                    vErrors = [err195];
                  } else {
                    vErrors.push(err195);
                  }
                  errors++;
                }
              } else {
                const err196 = { instancePath: instancePath + "/tabs/" + i4 + "/id", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err196];
                } else {
                  vErrors.push(err196);
                }
                errors++;
              }
            }
            if (data54.sectionId !== void 0) {
              let data56 = data54.sectionId;
              if (typeof data56 === "string") {
                if (func2(data56) > 100) {
                  const err197 = { instancePath: instancePath + "/tabs/" + i4 + "/sectionId", schemaPath: "#/$defs/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err197];
                  } else {
                    vErrors.push(err197);
                  }
                  errors++;
                }
                if (func2(data56) < 1) {
                  const err198 = { instancePath: instancePath + "/tabs/" + i4 + "/sectionId", schemaPath: "#/$defs/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err198];
                  } else {
                    vErrors.push(err198);
                  }
                  errors++;
                }
                if (!pattern4.test(data56)) {
                  const err199 = { instancePath: instancePath + "/tabs/" + i4 + "/sectionId", schemaPath: "#/$defs/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$"' };
                  if (vErrors === null) {
                    vErrors = [err199];
                  } else {
                    vErrors.push(err199);
                  }
                  errors++;
                }
              } else {
                const err200 = { instancePath: instancePath + "/tabs/" + i4 + "/sectionId", schemaPath: "#/$defs/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err200];
                } else {
                  vErrors.push(err200);
                }
                errors++;
              }
            }
            if (data54.startMs !== void 0) {
              let data57 = data54.startMs;
              if (!(typeof data57 == "number" && (!(data57 % 1) && !isNaN(data57)) && isFinite(data57))) {
                const err201 = { instancePath: instancePath + "/tabs/" + i4 + "/startMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err201];
                } else {
                  vErrors.push(err201);
                }
                errors++;
              }
              if (typeof data57 == "number" && isFinite(data57)) {
                if (data57 < 0 || isNaN(data57)) {
                  const err202 = { instancePath: instancePath + "/tabs/" + i4 + "/startMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err202];
                  } else {
                    vErrors.push(err202);
                  }
                  errors++;
                }
              }
            }
            if (data54.endMs !== void 0) {
              let data58 = data54.endMs;
              if (!(typeof data58 == "number" && (!(data58 % 1) && !isNaN(data58)) && isFinite(data58))) {
                const err203 = { instancePath: instancePath + "/tabs/" + i4 + "/endMs", schemaPath: "#/$defs/timeMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err203];
                } else {
                  vErrors.push(err203);
                }
                errors++;
              }
              if (typeof data58 == "number" && isFinite(data58)) {
                if (data58 < 0 || isNaN(data58)) {
                  const err204 = { instancePath: instancePath + "/tabs/" + i4 + "/endMs", schemaPath: "#/$defs/timeMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err204];
                  } else {
                    vErrors.push(err204);
                  }
                  errors++;
                }
              }
            }
            if (data54.label !== void 0) {
              let data59 = data54.label;
              if (typeof data59 === "string") {
                if (func2(data59) > 120) {
                  const err205 = { instancePath: instancePath + "/tabs/" + i4 + "/label", schemaPath: "#/properties/tabs/items/properties/label/maxLength", keyword: "maxLength", params: { limit: 120 }, message: "must NOT have more than 120 characters" };
                  if (vErrors === null) {
                    vErrors = [err205];
                  } else {
                    vErrors.push(err205);
                  }
                  errors++;
                }
                if (func2(data59) < 1) {
                  const err206 = { instancePath: instancePath + "/tabs/" + i4 + "/label", schemaPath: "#/properties/tabs/items/properties/label/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err206];
                  } else {
                    vErrors.push(err206);
                  }
                  errors++;
                }
              } else {
                const err207 = { instancePath: instancePath + "/tabs/" + i4 + "/label", schemaPath: "#/properties/tabs/items/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err207];
                } else {
                  vErrors.push(err207);
                }
                errors++;
              }
            }
            if (data54.ascii !== void 0) {
              let data60 = data54.ascii;
              if (typeof data60 === "string") {
                if (func2(data60) > 2e4) {
                  const err208 = { instancePath: instancePath + "/tabs/" + i4 + "/ascii", schemaPath: "#/properties/tabs/items/properties/ascii/maxLength", keyword: "maxLength", params: { limit: 2e4 }, message: "must NOT have more than 20000 characters" };
                  if (vErrors === null) {
                    vErrors = [err208];
                  } else {
                    vErrors.push(err208);
                  }
                  errors++;
                }
                if (func2(data60) < 1) {
                  const err209 = { instancePath: instancePath + "/tabs/" + i4 + "/ascii", schemaPath: "#/properties/tabs/items/properties/ascii/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err209];
                  } else {
                    vErrors.push(err209);
                  }
                  errors++;
                }
              } else {
                const err210 = { instancePath: instancePath + "/tabs/" + i4 + "/ascii", schemaPath: "#/properties/tabs/items/properties/ascii/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err210];
                } else {
                  vErrors.push(err210);
                }
                errors++;
              }
            }
          } else {
            const err211 = { instancePath: instancePath + "/tabs/" + i4, schemaPath: "#/properties/tabs/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err211];
            } else {
              vErrors.push(err211);
            }
            errors++;
          }
        }
      } else {
        const err212 = { instancePath: instancePath + "/tabs", schemaPath: "#/properties/tabs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err212];
        } else {
          vErrors.push(err212);
        }
        errors++;
      }
    }
    if (data.sources !== void 0) {
      let data61 = data.sources;
      if (Array.isArray(data61)) {
        const len5 = data61.length;
        for (let i5 = 0; i5 < len5; i5++) {
          let data62 = data61[i5];
          if (data62 && typeof data62 == "object" && !Array.isArray(data62)) {
            if (data62.url === void 0) {
              const err213 = { instancePath: instancePath + "/sources/" + i5, schemaPath: "#/properties/sources/items/required", keyword: "required", params: { missingProperty: "url" }, message: "must have required property 'url'" };
              if (vErrors === null) {
                vErrors = [err213];
              } else {
                vErrors.push(err213);
              }
              errors++;
            }
            if (data62.title === void 0) {
              const err214 = { instancePath: instancePath + "/sources/" + i5, schemaPath: "#/properties/sources/items/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
              if (vErrors === null) {
                vErrors = [err214];
              } else {
                vErrors.push(err214);
              }
              errors++;
            }
            if (data62.retrievedAt === void 0) {
              const err215 = { instancePath: instancePath + "/sources/" + i5, schemaPath: "#/properties/sources/items/required", keyword: "required", params: { missingProperty: "retrievedAt" }, message: "must have required property 'retrievedAt'" };
              if (vErrors === null) {
                vErrors = [err215];
              } else {
                vErrors.push(err215);
              }
              errors++;
            }
            for (const key12 in data62) {
              if (!(key12 === "url" || key12 === "title" || key12 === "retrievedAt")) {
                const err216 = { instancePath: instancePath + "/sources/" + i5, schemaPath: "#/properties/sources/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err216];
                } else {
                  vErrors.push(err216);
                }
                errors++;
              }
            }
            if (data62.url !== void 0) {
              let data63 = data62.url;
              if (typeof data63 === "string") {
                if (func2(data63) > 2048) {
                  const err217 = { instancePath: instancePath + "/sources/" + i5 + "/url", schemaPath: "#/properties/sources/items/properties/url/maxLength", keyword: "maxLength", params: { limit: 2048 }, message: "must NOT have more than 2048 characters" };
                  if (vErrors === null) {
                    vErrors = [err217];
                  } else {
                    vErrors.push(err217);
                  }
                  errors++;
                }
                if (!pattern19.test(data63)) {
                  const err218 = { instancePath: instancePath + "/sources/" + i5 + "/url", schemaPath: "#/properties/sources/items/properties/url/pattern", keyword: "pattern", params: { pattern: "^https?://" }, message: 'must match pattern "^https?://"' };
                  if (vErrors === null) {
                    vErrors = [err218];
                  } else {
                    vErrors.push(err218);
                  }
                  errors++;
                }
                if (!formats0.test(data63)) {
                  const err219 = { instancePath: instancePath + "/sources/" + i5 + "/url", schemaPath: "#/properties/sources/items/properties/url/format", keyword: "format", params: { format: "uri" }, message: 'must match format "uri"' };
                  if (vErrors === null) {
                    vErrors = [err219];
                  } else {
                    vErrors.push(err219);
                  }
                  errors++;
                }
              } else {
                const err220 = { instancePath: instancePath + "/sources/" + i5 + "/url", schemaPath: "#/properties/sources/items/properties/url/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err220];
                } else {
                  vErrors.push(err220);
                }
                errors++;
              }
            }
            if (data62.title !== void 0) {
              let data64 = data62.title;
              if (typeof data64 === "string") {
                if (func2(data64) > 300) {
                  const err221 = { instancePath: instancePath + "/sources/" + i5 + "/title", schemaPath: "#/properties/sources/items/properties/title/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
                  if (vErrors === null) {
                    vErrors = [err221];
                  } else {
                    vErrors.push(err221);
                  }
                  errors++;
                }
              } else {
                const err222 = { instancePath: instancePath + "/sources/" + i5 + "/title", schemaPath: "#/properties/sources/items/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err222];
                } else {
                  vErrors.push(err222);
                }
                errors++;
              }
            }
            if (data62.retrievedAt !== void 0) {
              let data65 = data62.retrievedAt;
              const _errs187 = errors;
              let valid54 = false;
              const _errs188 = errors;
              if (typeof data65 === "string") {
                if (!formats2.test(data65)) {
                  const err223 = { instancePath: instancePath + "/sources/" + i5 + "/retrievedAt", schemaPath: "#/properties/sources/items/properties/retrievedAt/anyOf/0/format", keyword: "format", params: { format: "date-time" }, message: 'must match format "date-time"' };
                  if (vErrors === null) {
                    vErrors = [err223];
                  } else {
                    vErrors.push(err223);
                  }
                  errors++;
                }
              } else {
                const err224 = { instancePath: instancePath + "/sources/" + i5 + "/retrievedAt", schemaPath: "#/properties/sources/items/properties/retrievedAt/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err224];
                } else {
                  vErrors.push(err224);
                }
                errors++;
              }
              var _valid6 = _errs188 === errors;
              valid54 = valid54 || _valid6;
              const _errs190 = errors;
              if (data65 !== null) {
                const err225 = { instancePath: instancePath + "/sources/" + i5 + "/retrievedAt", schemaPath: "#/properties/sources/items/properties/retrievedAt/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                if (vErrors === null) {
                  vErrors = [err225];
                } else {
                  vErrors.push(err225);
                }
                errors++;
              }
              var _valid6 = _errs190 === errors;
              valid54 = valid54 || _valid6;
              if (!valid54) {
                const err226 = { instancePath: instancePath + "/sources/" + i5 + "/retrievedAt", schemaPath: "#/properties/sources/items/properties/retrievedAt/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err226];
                } else {
                  vErrors.push(err226);
                }
                errors++;
              } else {
                errors = _errs187;
                if (vErrors !== null) {
                  if (_errs187) {
                    vErrors.length = _errs187;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err227 = { instancePath: instancePath + "/sources/" + i5, schemaPath: "#/properties/sources/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err227];
            } else {
              vErrors.push(err227);
            }
            errors++;
          }
        }
      } else {
        const err228 = { instancePath: instancePath + "/sources", schemaPath: "#/properties/sources/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err228];
        } else {
          vErrors.push(err228);
        }
        errors++;
      }
    }
    if (data.reviewWarnings !== void 0) {
      let data66 = data.reviewWarnings;
      if (Array.isArray(data66)) {
        const len6 = data66.length;
        for (let i6 = 0; i6 < len6; i6++) {
          let data67 = data66[i6];
          if (typeof data67 === "string") {
            if (func2(data67) > 2e3) {
              const err229 = { instancePath: instancePath + "/reviewWarnings/" + i6, schemaPath: "#/properties/reviewWarnings/items/maxLength", keyword: "maxLength", params: { limit: 2e3 }, message: "must NOT have more than 2000 characters" };
              if (vErrors === null) {
                vErrors = [err229];
              } else {
                vErrors.push(err229);
              }
              errors++;
            }
            if (func2(data67) < 1) {
              const err230 = { instancePath: instancePath + "/reviewWarnings/" + i6, schemaPath: "#/properties/reviewWarnings/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err230];
              } else {
                vErrors.push(err230);
              }
              errors++;
            }
          } else {
            const err231 = { instancePath: instancePath + "/reviewWarnings/" + i6, schemaPath: "#/properties/reviewWarnings/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err231];
            } else {
              vErrors.push(err231);
            }
            errors++;
          }
        }
        let i7 = data66.length;
        let j0;
        if (i7 > 1) {
          const indices0 = {};
          for (; i7--; ) {
            let item0 = data66[i7];
            if (typeof item0 !== "string") {
              continue;
            }
            if (typeof indices0[item0] == "number") {
              j0 = indices0[item0];
              const err232 = { instancePath: instancePath + "/reviewWarnings", schemaPath: "#/properties/reviewWarnings/uniqueItems", keyword: "uniqueItems", params: { i: i7, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i7 + " are identical)" };
              if (vErrors === null) {
                vErrors = [err232];
              } else {
                vErrors.push(err232);
              }
              errors++;
              break;
            }
            indices0[item0] = i7;
          }
        }
      } else {
        const err233 = { instancePath: instancePath + "/reviewWarnings", schemaPath: "#/properties/reviewWarnings/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err233];
        } else {
          vErrors.push(err233);
        }
        errors++;
      }
    }
  } else {
    const err234 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err234];
    } else {
      vErrors.push(err234);
    }
    errors++;
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
export {
  validateSongV2_tmp_default as default,
  validate
};
