function igDiag() {
  var t0 = Date.now();
  // no filter set -> should now be fast (12-creator enrichment sample)
  var msg = igbsRunBrandSearch("G FUEL", "gfuelpartner", "", "", "");
  Logger.log("TOOK " + Math.round((Date.now() - t0) / 1000) + "s");
  Logger.log(msg);
  return "ok";
}