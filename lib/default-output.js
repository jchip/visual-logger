"use strict";

const logUpdate = require("log-update");

module.exports = {
  isTTY: () => process.stdout.isTTY,
  write: x => process.stdout.write(x),
  visual: {
    write: logUpdate,
    clear: logUpdate.clear
  }
};
