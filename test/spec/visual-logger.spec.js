"use strict";

const chalk = require("chalk");
chalk.enabled = false;
const VisualLogger = require("../..");

describe("visual-logger", function() {
  it("should init", () => {
    const visLog = new VisualLogger();
    expect(visLog._output).to.exist;
  });

  it("should log messages", () => {
    let out = [];
    const visLog = new VisualLogger({ output: { write: x => out.push(x) } });
    visLog.log("log info msg");
    visLog.debug("debug msg");
    visLog.verbose("verbose msg");
    visLog.info("info msg");
    visLog.warn("warn msg");
    visLog.error("error msg");
    visLog.fyi("fyi msg");
    expect(visLog.logData).to.deep.equal([
      "> log info msg",
      "> debug msg",
      "> verbose msg",
      "> info msg",
      "> warn msg",
      "> error msg",
      "> fyi msg"
    ]);

    expect(out).to.deep.equal([
      "> log info msg\n",
      "> info msg\n",
      "> warn msg\n",
      "> error msg\n",
      "> fyi msg\n"
    ]);
    out = [];
    visLog
      .prefix("!")
      .fyi("a")
      .prefix(false)
      .fyi("b")
      .fyi("c");
    expect(out).to.deep.equal(["!a\n", "b\n", "> c\n"]);
  });

  it("should allow changing default prefix", () => {
    const out = [];
    const visLog = new VisualLogger({
      output: { write: x => out.push(x) }
    });
    visLog.setPrefix("-").info("blah");
    expect(out).to.deep.equal(["-blah\n"]);
  });

  it("should reset color prefix when chalk enabled changes", () => {
    const out = [];
    const visLog = new VisualLogger({ output: { write: x => out.push(x) } });
    expect(visLog._colorPrefix.debug).to.equal("> ");
    chalk.enabled = true;
    visLog.log("hello");
    expect(visLog._colorPrefix.debug).to.not.equal("> ");
    chalk.enabled = false;
    visLog.log("hello");
    expect(visLog._colorPrefix.debug).to.equal("> ");
  });

  describe("visual item", function() {
    let out = [];
    let clearCount = 0;
    let vis;
    let visList;
    let visLog;
    const make = opts => {
      out = [];
      clearCount = 0;
      vis = undefined;
      visList = [];

      return new VisualLogger(
        Object.assign(
          {
            updatesPerDot: 1,
            output: {
              write: x => {
                const l = out[out.length - 1];
                if (!l || l.endsWith("\n")) {
                  out.push(x);
                  return;
                }
                out[out.length - 1] += x;
              },
              visual: {
                write: x => {
                  vis = x;
                  visList.push(x);
                },
                clear: () => {
                  vis = undefined;
                  clearCount++;
                }
              }
            }
          },
          opts
        )
      );
    };

    const itemOpt = { name: "TEST_1", color: "blue" };
    beforeEach(() => {
      visLog = make();
      visLog.addItem(itemOpt);
    });

    const update1 = () => {
      visLog.updateItem("TEST_1", "hello");
      expect(visLog.hasItem("TEST_1")).to.equal(true);
      expect(vis).to.equal("TEST_1: hello");
    };

    const add2 = display => {
      visLog.addItem({ name: "TEST_2", color: "red", display });
      visLog.updateItem("TEST_2", "world");
      expect(visLog.hasItem("TEST_2")).to.equal(true);
    };

    it("setItemType should fallback to simple if not TTY", () => {
      visLog._output.isTTY = () => undefined;
      visLog.setItemType("normal");
      expect(visLog._itemType).to.equal(VisualLogger.LogItemTypes.simple);
    });

    it("setItemType should turn off items if type is invalid", () => {
      visLog.setItemType("foo");
      expect(visLog._itemType).to.equal(VisualLogger.LogItemTypes.none);
    });

    it("setItemType should turn off items if type is falsy", () => {
      visLog.setItemType();
      expect(visLog._itemType).to.equal(VisualLogger.LogItemTypes.none);
    });

    it("should handle update visual item", () => {
      visLog
        .addItem(itemOpt)
        .updateItem("foo")
        .updateItem("TEST_1", "hello");
      expect(vis).to.equal("TEST_1: hello");
      visLog.error("error message");
      expect(clearCount).to.equal(1);
      expect(out).to.deep.equal(["> error message\n"]);
      add2();
      visLog.updateItem("TEST_1"); // should do nothing w/o data
      expect(vis).to.equal("TEST_1: hello\nTEST_2: world");
    });

    it("should removeItem", () => {
      update1();
      add2();
      visLog.removeItem("bad").removeItem("TEST_2");
      expect(visLog.hasItem("TEST_1"), "should have TEST_1 item").to.equal(true);
      expect(visLog.hasItem("TEST_2"), "should have TEST_2 item").to.equal(false);
    });

    it("should freeItem and stop updating them", () => {
      update1();
      visLog.freezeItems(false);
      expect(vis).to.equal(undefined);
      out = [];
      visLog.freezeItems(true);
      expect(out[0]).to.equal("TEST_1: hello\n");
    });

    it("should handle auto spinners", done => {
      visLog.addItem({ name: "T", spinner: VisualLogger.spinners[0], color: "blue" });
      setTimeout(() => {
        expect(visList.slice(0, 4)).to.deep.equal([
          "TEST_1: \n/ T: ",
          "TEST_1: \n- T: ",
          "TEST_1: \n\\ T: ",
          "TEST_1: \n| T: "
        ]);
        visLog.removeItem("T");
        visList = [];
        visLog.updateItem("TEST_1", { msg: "1" });
        expect(visList).to.deep.equal(["TEST_1: 1"]);
        done();
      }, 500);
    });

    it("should not start spinner if item type is not normal", () => {
      visLog.setItemType("simple");
      visLog.addItem({ name: "S", spinner: "[]" });
      expect(visLog._itemOptions.S.spinTimer).to.equal(undefined);
    });

    it("should freeze/unfreeze items", done => {
      visLog.addItem({ name: "T", spinner: VisualLogger.spinners[0], color: "blue" });
      visLog.updateItem("T", "foo");
      setTimeout(() => {
        expect(visList.slice(0, 2)).to.deep.equal(["TEST_1: \n| T: foo", "TEST_1: \n/ T: foo"]);
        visLog.freezeItems();
        setTimeout(() => {
          expect(visList.slice(0, 2)).to.deep.equal(["TEST_1: \n| T: foo", "TEST_1: \n/ T: foo"]);
          visLog.unfreezeItems();
          visLog.unfreezeItems();
          setTimeout(() => {
            expect(visList.slice(0, 3)).to.deep.equal([
              "TEST_1: \n| T: foo",
              "TEST_1: \n/ T: foo",
              "TEST_1: \n- T: foo"
            ]);
            done();
          }, 115);
        }, 100);
      }, 150);
    });

    it("should freeze items and show correct current render when item type is simple", () => {
      visLog.addItem({ name: "T", spinner: VisualLogger.spinners[0], color: "blue" });
      visLog.setItemType("simple");
      visLog.updateItem("T", "hello world");
      visLog.freezeItems(true);
      expect(out).to.deep.equal([".\n", "TEST_1: \nT: hello world\n"]);
    });

    it("should use display from data when updateItem", () => {
      update1();
      visLog.updateItem("TEST_1", { msg: "foo", display: "bar" });
      expect(vis).to.equal("bar: foo");
    });

    it("should not save to log data if it's off", () => {
      visLog._options.saveLogs = false;
      update1();
      expect(visLog.logData).to.deep.equal([]);
    });

    it("should not log item if type is none", () => {
      visLog.setItemType("none");
      visLog.updateItem("TEST_1", "hello");
      expect(out).to.deep.equal([]);
      expect(visList).to.deep.equal([]);
    });

    it("should log dots if item type is simple", () => {
      visLog = make({ maxDots: 10 });
      visLog.addItem(itemOpt);
      visLog.setItemType("simple");
      visLog.updateItem("TEST_1", "hello");
      expect(out).to.deep.equal(["."]);
      expect(visList).to.deep.equal([]);
      out = [];
      visLog.clearItems();
      expect(out).to.deep.equal([]);
      expect(visList).to.deep.equal([]);
      for (let i = 0; i < 15; i++) {
        visLog.updateItem("TEST_1", `${i}`);
      }
      expect(out).to.deep.equal([".........\n", "......"]);
    });

    it("should log less dots if updatesPerDot is > 1", () => {
      visLog = make({ maxDots: 10, updatesPerDot: undefined });
      visLog.addItem(itemOpt);
      visLog.setItemType("simple");
      visLog.updateItem("TEST_1", "hello");
      expect(out).to.deep.equal([]);
      expect(visList).to.deep.equal([]);
      out = [];
      visLog.clearItems();
      expect(out).to.deep.equal([]);
      expect(visList).to.deep.equal([]);
      for (let i = 0; i < 15; i++) {
        visLog.updateItem("TEST_1", `${i}`);
      }
      expect(out).to.deep.equal(["..."]);
    });

    it("should not save to log data if flag is false", () => {
      visLog.updateItem("TEST_1", { msg: "blah", _save: false });
      expect(visLog.logData).to.deep.equal([]);
      visLog.addItem({ name: "B", save: false });
      visLog.updateItem("B", "hello");
      expect(visList).to.deep.equal(["TEST_1: blah", "TEST_1: blah\nB: hello"]);
      expect(visLog.logData).to.deep.equal([]);
    });

    it("should render if _render flag is false", () => {
      visLog.updateItem("TEST_1", { msg: "blah", _save: false, _render: false });
      expect(visLog.logData).to.deep.equal([]);
      visLog.addItem({ name: "B", save: false });
      visLog.updateItem("B", "hello");
      expect(visList).to.deep.equal(["TEST_1: \nB: hello"]);
      expect(visLog.logData).to.deep.equal([]);
    });
  });
});
