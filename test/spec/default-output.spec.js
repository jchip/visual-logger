"use strict";
const defaultOutput = require("../../lib/default-output");
describe("default output write", function() {
  it("should write to process.stdout", () => {
    const write = process.stdout.write;
    let called;
    process.stdout.write = x => (called = x);
    defaultOutput.write("blah");
    process.stdout.write = write;
    expect(called).to.equal("blah");
  });

  it("should detect tty", () => {
    expect(defaultOutput.isTTY()).to.be.undefined;
  });
});
