// Replace both original functions with these wrappers; do not append duplicates.
function doPost(e) { return secureGatewayDoPost(e); }
function doGet(e) { return secureGatewayDoGet(e); }
