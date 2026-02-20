"use strict";

function notFoundHandler(req, res) {
  if (req.accepts("html")) {
    res.status(404).render("404", { title: "404 Not Found", page: "error" });
    return;
  }

  if (req.accepts("json")) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(404).type("txt").send("Not Found");
}

function internalServerErrorHandler(error, req, res, next) {
  if (req?.log && typeof req.log.error === "function") {
    req.log.error({ err: error }, "Unhandled server error");
  } else {
    console.error("Unhandled server error:", error);
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  if (req.accepts("html")) {
    res.status(500).render("500", { title: "500 Server Error", page: "error" });
    return;
  }

  if (req.accepts("json")) {
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }

  res.status(500).type("txt").send("Internal Server Error");
}

module.exports = {
  notFoundHandler,
  internalServerErrorHandler,
};
