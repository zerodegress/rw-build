import { describe, it } from "mocha";
import { expect } from "chai";
import toml from "toml";

describe('toml', () => {
    it('parses tomls', () => {
        console.log(toml.parse('[[abc.ab]]\n[[abc.ab]]'));
    });
});