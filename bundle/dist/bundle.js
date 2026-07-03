(function() {
  "use strict";
  const cvSource = '/*\nCopyright (c) 2011 Juan Mellado\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.\n*/\n\n/*\nReferences:\n- "OpenCV: Open Computer Vision Library"\n  http://sourceforge.net/projects/opencvlibrary/\n- "Stack Blur: Fast But Goodlooking"\n  http://incubator.quasimondo.com/processing/fast_blur_deluxe.php\n*/\n\nvar CV = CV || {};\nthis.CV = CV;\n\nCV.Image = function(width, height, data){\n  this.width = width || 0;\n  this.height = height || 0;\n  this.data = data || [];\n};\n\nCV.grayscale = function(imageSrc, imageDst){\n  var src = imageSrc.data, dst = imageDst.data, len = src.length,\n      i = 0, j = 0;\n\n  for (; i < len; i += 4){\n    dst[j ++] =\n      (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114 + 0.5) & 0xff;\n  }\n\n  imageDst.width = imageSrc.width;\n  imageDst.height = imageSrc.height;\n\n  return imageDst;\n};\n\nCV.threshold = function(imageSrc, imageDst, threshold){\n  var src = imageSrc.data, dst = imageDst.data,\n      len = src.length, tab = [], i;\n\n  for (i = 0; i < 256; ++ i){\n    tab[i] = i <= threshold? 0: 255;\n  }\n\n  for (i = 0; i < len; ++ i){\n    dst[i] = tab[ src[i] ];\n  }\n\n  imageDst.width = imageSrc.width;\n  imageDst.height = imageSrc.height;\n\n  return imageDst;\n};\n\nCV.adaptiveThreshold = function(imageSrc, imageDst, kernelSize, threshold){\n  var src = imageSrc.data, dst = imageDst.data, len = src.length, tab = [], i;\n\n  CV.stackBoxBlur(imageSrc, imageDst, kernelSize);\n\n  for (i = 0; i < 768; ++ i){\n    tab[i] = (i - 255 <= -threshold)? 255: 0;\n  }\n\n  for (i = 0; i < len; ++ i){\n    dst[i] = tab[ src[i] - dst[i] + 255 ];\n  }\n\n  imageDst.width = imageSrc.width;\n  imageDst.height = imageSrc.height;\n\n  return imageDst;\n};\n\nCV.otsu = function(imageSrc){\n  var src = imageSrc.data, len = src.length, hist = [],\n      threshold = 0, sum = 0, sumB = 0, wB = 0, wF = 0, max = 0,\n      mu, between, i;\n\n  for (i = 0; i < 256; ++ i){\n    hist[i] = 0;\n  }\n\n  for (i = 0; i < len; ++ i){\n    hist[ src[i] ] ++;\n  }\n\n  for (i = 0; i < 256; ++ i){\n    sum += hist[i] * i;\n  }\n\n  for (i = 0; i < 256; ++ i){\n    wB += hist[i];\n    if (0 !== wB){\n\n      wF = len - wB;\n      if (0 === wF){\n        break;\n      }\n\n      sumB += hist[i] * i;\n\n      mu = (sumB / wB) - ( (sum - sumB) / wF );\n\n      between = wB * wF * mu * mu;\n\n      if (between > max){\n        max = between;\n        threshold = i;\n      }\n    }\n  }\n\n  return threshold;\n};\n\nCV.stackBoxBlurMult =\n  [1, 171, 205, 293, 57, 373, 79, 137, 241, 27, 391, 357, 41, 19, 283, 265];\n\nCV.stackBoxBlurShift =\n  [0, 9, 10, 11, 9, 12, 10, 11, 12, 9, 13, 13, 10, 9, 13, 13];\n\nCV.BlurStack = function(){\n  this.color = 0;\n  this.next = null;\n};\n\nCV.stackBoxBlur = function(imageSrc, imageDst, kernelSize){\n  var src = imageSrc.data, dst = imageDst.data,\n      height = imageSrc.height, width = imageSrc.width,\n      heightMinus1 = height - 1, widthMinus1 = width - 1,\n      size = kernelSize + kernelSize + 1, radius = kernelSize + 1,\n      mult = CV.stackBoxBlurMult[kernelSize],\n      shift = CV.stackBoxBlurShift[kernelSize],\n      stack, stackStart, color, sum, pos, start, p, x, y, i;\n\n  stack = stackStart = new CV.BlurStack();\n  for (i = 1; i < size; ++ i){\n    stack = stack.next = new CV.BlurStack();\n  }\n  stack.next = stackStart;\n\n  pos = 0;\n\n  for (y = 0; y < height; ++ y){\n    start = pos;\n\n    color = src[pos];\n    sum = radius * color;\n\n    stack = stackStart;\n    for (i = 0; i < radius; ++ i){\n      stack.color = color;\n      stack = stack.next;\n    }\n    for (i = 1; i < radius; ++ i){\n      stack.color = src[pos + i];\n      sum += stack.color;\n      stack = stack.next;\n    }\n\n    stack = stackStart;\n    for (x = 0; x < width; ++ x){\n      dst[pos ++] = (sum * mult) >>> shift;\n\n      p = x + radius;\n      p = start + (p < widthMinus1? p: widthMinus1);\n      sum -= stack.color - src[p];\n\n      stack.color = src[p];\n      stack = stack.next;\n    }\n  }\n\n  for (x = 0; x < width; ++ x){\n    pos = x;\n    start = pos + width;\n\n    color = dst[pos];\n    sum = radius * color;\n\n    stack = stackStart;\n    for (i = 0; i < radius; ++ i){\n      stack.color = color;\n      stack = stack.next;\n    }\n    for (i = 1; i < radius; ++ i){\n      stack.color = dst[start];\n      sum += stack.color;\n      stack = stack.next;\n\n      start += width;\n    }\n\n    stack = stackStart;\n    for (y = 0; y < height; ++ y){\n      dst[pos] = (sum * mult) >>> shift;\n\n      p = y + radius;\n      p = x + ( (p < heightMinus1? p: heightMinus1) * width );\n      sum -= stack.color - dst[p];\n\n      stack.color = dst[p];\n      stack = stack.next;\n\n      pos += width;\n    }\n  }\n\n  return imageDst;\n};\n\nCV.gaussianBlur = function(imageSrc, imageDst, imageMean, kernelSize){\n  var kernel = CV.gaussianKernel(kernelSize);\n\n  imageDst.width = imageSrc.width;\n  imageDst.height = imageSrc.height;\n\n  imageMean.width = imageSrc.width;\n  imageMean.height = imageSrc.height;\n\n  CV.gaussianBlurFilter(imageSrc, imageMean, kernel, true);\n  CV.gaussianBlurFilter(imageMean, imageDst, kernel, false);\n\n  return imageDst;\n};\n\nCV.gaussianBlurFilter = function(imageSrc, imageDst, kernel, horizontal){\n  var src = imageSrc.data, dst = imageDst.data,\n      height = imageSrc.height, width = imageSrc.width,\n      pos = 0, limit = kernel.length >> 1,\n      cur, value, i, j, k;\n\n  for (i = 0; i < height; ++ i){\n\n    for (j = 0; j < width; ++ j){\n      value = 0.0;\n\n      for (k = -limit; k <= limit; ++ k){\n\n        if (horizontal){\n          cur = pos + k;\n          if (j + k < 0){\n            cur = pos;\n          }\n          else if (j + k >= width){\n            cur = pos;\n          }\n        }else{\n          cur = pos + (k * width);\n          if (i + k < 0){\n            cur = pos;\n          }\n          else if (i + k >= height){\n            cur = pos;\n          }\n        }\n\n        value += kernel[limit + k] * src[cur];\n      }\n\n      dst[pos ++] = horizontal? value: (value + 0.5) & 0xff;\n    }\n  }\n\n  return imageDst;\n};\n\nCV.gaussianKernel = function(kernelSize){\n  var tab =\n    [ [1],\n      [0.25, 0.5, 0.25],\n      [0.0625, 0.25, 0.375, 0.25, 0.0625],\n      [0.03125, 0.109375, 0.21875, 0.28125, 0.21875, 0.109375, 0.03125] ],\n    kernel = [], center, sigma, scale2X, sum, x, i;\n\n  if ( (kernelSize <= 7) && (kernelSize % 2 === 1) ){\n    kernel = tab[kernelSize >> 1];\n  }else{\n    center = (kernelSize - 1.0) * 0.5;\n    sigma = 0.8 + (0.3 * (center - 1.0) );\n    scale2X = -0.5 / (sigma * sigma);\n    sum = 0.0;\n    for (i = 0; i < kernelSize; ++ i){\n      x = i - center;\n      sum += kernel[i] = Math.exp(scale2X * x * x);\n    }\n    sum = 1 / sum;\n    for (i = 0; i < kernelSize; ++ i){\n      kernel[i] *= sum;\n    }\n  }\n\n  return kernel;\n};\n\nCV.findContours = function(imageSrc, binary){\n  var width = imageSrc.width, height = imageSrc.height, contours = [],\n      src, deltas, pos, pix, nbd, outer, hole, i, j;\n\n  src = CV.binaryBorder(imageSrc, binary);\n\n  deltas = CV.neighborhoodDeltas(width + 2);\n\n  pos = width + 3;\n  nbd = 1;\n\n  for (i = 0; i < height; ++ i, pos += 2){\n\n    for (j = 0; j < width; ++ j, ++ pos){\n      pix = src[pos];\n\n      if (0 !== pix){\n        outer = hole = false;\n\n        if (1 === pix && 0 === src[pos - 1]){\n          outer = true;\n        }\n        else if (pix >= 1 && 0 === src[pos + 1]){\n          hole = true;\n        }\n\n        if (outer || hole){\n          ++ nbd;\n\n          contours.push( CV.borderFollowing(src, pos, nbd, {x: j, y: i}, hole, deltas) );\n        }\n      }\n    }\n  }\n\n  return contours;\n};\n\nCV.borderFollowing = function(src, pos, nbd, point, hole, deltas){\n  var contour = [], pos1, pos3, pos4, s, s_end, s_prev;\n\n  contour.hole = hole;\n\n  s = s_end = hole? 0: 4;\n  do{\n    s = (s - 1) & 7;\n    pos1 = pos + deltas[s];\n    if (src[pos1] !== 0){\n      break;\n    }\n  }while(s !== s_end);\n\n  if (s === s_end){\n    src[pos] = -nbd;\n    contour.push( {x: point.x, y: point.y} );\n\n  }else{\n    pos3 = pos;\n    s_prev = s ^ 4;\n\n    while(true){\n      s_end = s;\n\n      do{\n        pos4 = pos3 + deltas[++ s];\n      }while(src[pos4] === 0);\n\n      s &= 7;\n\n      if ( ( (s - 1) >>> 0) < (s_end >>> 0) ){\n        src[pos3] = -nbd;\n      }\n      else if (src[pos3] === 1){\n        src[pos3] = nbd;\n      }\n\n      contour.push( {x: point.x, y: point.y} );\n\n      s_prev = s;\n\n      point.x += CV.neighborhood[s][0];\n      point.y += CV.neighborhood[s][1];\n\n      if ( (pos4 === pos) && (pos3 === pos1) ){\n        break;\n      }\n\n      pos3 = pos4;\n      s = (s + 4) & 7;\n    }\n  }\n\n  return contour;\n};\n\nCV.neighborhood =\n  [ [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1] ];\n\nCV.neighborhoodDeltas = function(width){\n  var deltas = [], len = CV.neighborhood.length, i = 0;\n\n  for (; i < len; ++ i){\n    deltas[i] = CV.neighborhood[i][0] + (CV.neighborhood[i][1] * width);\n  }\n\n  return deltas.concat(deltas);\n};\n\nCV.approxPolyDP = function(contour, epsilon){\n  var slice = {start_index: 0, end_index: 0},\n      right_slice = {start_index: 0, end_index: 0},\n      poly = [], stack = [], len = contour.length,\n      pt, start_pt, end_pt, dist, max_dist, le_eps,\n      dx, dy, i, j, k;\n\n  epsilon *= epsilon;\n\n  k = 0;\n\n  for (i = 0; i < 3; ++ i){\n    max_dist = 0;\n\n    k = (k + right_slice.start_index) % len;\n    start_pt = contour[k];\n    if (++ k === len) {k = 0;}\n\n    for (j = 1; j < len; ++ j){\n      pt = contour[k];\n      if (++ k === len) {k = 0;}\n\n      dx = pt.x - start_pt.x;\n      dy = pt.y - start_pt.y;\n      dist = dx * dx + dy * dy;\n\n      if (dist > max_dist){\n        max_dist = dist;\n        right_slice.start_index = j;\n      }\n    }\n  }\n\n  if (max_dist <= epsilon){\n    poly.push( {x: start_pt.x, y: start_pt.y} );\n\n  }else{\n    slice.start_index = k;\n    slice.end_index = (right_slice.start_index += slice.start_index);\n\n    right_slice.start_index -= right_slice.start_index >= len? len: 0;\n    right_slice.end_index = slice.start_index;\n    if (right_slice.end_index < right_slice.start_index){\n      right_slice.end_index += len;\n    }\n\n    stack.push( {start_index: right_slice.start_index, end_index: right_slice.end_index} );\n    stack.push( {start_index: slice.start_index, end_index: slice.end_index} );\n  }\n\n  while(stack.length !== 0){\n    slice = stack.pop();\n\n    end_pt = contour[slice.end_index % len];\n    start_pt = contour[k = slice.start_index % len];\n    if (++ k === len) {k = 0;}\n\n    if (slice.end_index <= slice.start_index + 1){\n      le_eps = true;\n\n    }else{\n      max_dist = 0;\n\n      dx = end_pt.x - start_pt.x;\n      dy = end_pt.y - start_pt.y;\n\n      for (i = slice.start_index + 1; i < slice.end_index; ++ i){\n        pt = contour[k];\n        if (++ k === len) {k = 0;}\n\n        dist = Math.abs( (pt.y - start_pt.y) * dx - (pt.x - start_pt.x) * dy);\n\n        if (dist > max_dist){\n          max_dist = dist;\n          right_slice.start_index = i;\n        }\n      }\n\n      le_eps = max_dist * max_dist <= epsilon * (dx * dx + dy * dy);\n    }\n\n    if (le_eps){\n      poly.push( {x: start_pt.x, y: start_pt.y} );\n\n    }else{\n      right_slice.end_index = slice.end_index;\n      slice.end_index = right_slice.start_index;\n\n      stack.push( {start_index: right_slice.start_index, end_index: right_slice.end_index} );\n      stack.push( {start_index: slice.start_index, end_index: slice.end_index} );\n    }\n  }\n\n  return poly;\n};\n\nCV.warp = function(imageSrc, imageDst, contour, warpSize){\n  var src = imageSrc.data, dst = imageDst.data,\n      width = imageSrc.width, height = imageSrc.height,\n      pos = 0,\n      sx1, sx2, dx1, dx2, sy1, sy2, dy1, dy2, p1, p2, p3, p4,\n      m, r, s, t, u, v, w, x, y, i, j;\n\n  m = CV.getPerspectiveTransform(contour, warpSize - 1);\n\n  r = m[8];\n  s = m[2];\n  t = m[5];\n\n  for (i = 0; i < warpSize; ++ i){\n    r += m[7];\n    s += m[1];\n    t += m[4];\n\n    u = r;\n    v = s;\n    w = t;\n\n    for (j = 0; j < warpSize; ++ j){\n      u += m[6];\n      v += m[0];\n      w += m[3];\n\n      x = v / u;\n      y = w / u;\n\n      sx1 = x >>> 0;\n      sx2 = (sx1 === width - 1)? sx1: sx1 + 1;\n      dx1 = x - sx1;\n      dx2 = 1.0 - dx1;\n\n      sy1 = y >>> 0;\n      sy2 = (sy1 === height - 1)? sy1: sy1 + 1;\n      dy1 = y - sy1;\n      dy2 = 1.0 - dy1;\n\n      p1 = p2 = sy1 * width;\n      p3 = p4 = sy2 * width;\n\n      dst[pos ++] =\n        (dy2 * (dx2 * src[p1 + sx1] + dx1 * src[p2 + sx2]) +\n         dy1 * (dx2 * src[p3 + sx1] + dx1 * src[p4 + sx2]) ) & 0xff;\n\n    }\n  }\n\n  imageDst.width = warpSize;\n  imageDst.height = warpSize;\n\n  return imageDst;\n};\n\nCV.getPerspectiveTransform = function(src, size){\n  var rq = CV.square2quad(src);\n\n  rq[0] /= size;\n  rq[1] /= size;\n  rq[3] /= size;\n  rq[4] /= size;\n  rq[6] /= size;\n  rq[7] /= size;\n\n  return rq;\n};\n\nCV.square2quad = function(src){\n  var sq = [], px, py, dx1, dx2, dy1, dy2, den;\n\n  px = src[0].x - src[1].x + src[2].x - src[3].x;\n  py = src[0].y - src[1].y + src[2].y - src[3].y;\n\n  if (0 === px && 0 === py){\n    sq[0] = src[1].x - src[0].x;\n    sq[1] = src[2].x - src[1].x;\n    sq[2] = src[0].x;\n    sq[3] = src[1].y - src[0].y;\n    sq[4] = src[2].y - src[1].y;\n    sq[5] = src[0].y;\n    sq[6] = 0;\n    sq[7] = 0;\n    sq[8] = 1;\n\n  }else{\n    dx1 = src[1].x - src[2].x;\n    dx2 = src[3].x - src[2].x;\n    dy1 = src[1].y - src[2].y;\n    dy2 = src[3].y - src[2].y;\n    den = dx1 * dy2 - dx2 * dy1;\n\n    sq[6] = (px * dy2 - dx2 * py) / den;\n    sq[7] = (dx1 * py - px * dy1) / den;\n    sq[8] = 1;\n    sq[0] = src[1].x - src[0].x + sq[6] * src[1].x;\n    sq[1] = src[3].x - src[0].x + sq[7] * src[3].x;\n    sq[2] = src[0].x;\n    sq[3] = src[1].y - src[0].y + sq[6] * src[1].y;\n    sq[4] = src[3].y - src[0].y + sq[7] * src[3].y;\n    sq[5] = src[0].y;\n  }\n\n  return sq;\n};\n\nCV.isContourConvex = function(contour){\n  var orientation = 0, convex = true,\n      len = contour.length, i = 0, j = 0,\n      cur_pt, prev_pt, dxdy0, dydx0, dx0, dy0, dx, dy;\n\n  prev_pt = contour[len - 1];\n  cur_pt = contour[0];\n\n  dx0 = cur_pt.x - prev_pt.x;\n  dy0 = cur_pt.y - prev_pt.y;\n\n  for (; i < len; ++ i){\n    if (++ j === len) {j = 0;}\n\n    prev_pt = cur_pt;\n    cur_pt = contour[j];\n\n    dx = cur_pt.x - prev_pt.x;\n    dy = cur_pt.y - prev_pt.y;\n    dxdy0 = dx * dy0;\n    dydx0 = dy * dx0;\n\n    orientation |= dydx0 > dxdy0? 1: (dydx0 < dxdy0? 2: 3);\n\n    if (3 === orientation){\n        convex = false;\n        break;\n    }\n\n    dx0 = dx;\n    dy0 = dy;\n  }\n\n  return convex;\n};\n\nCV.perimeter = function(poly){\n  var len = poly.length, i = 0, j = len - 1,\n      p = 0.0, dx, dy;\n\n  for (; i < len; j = i ++){\n    dx = poly[i].x - poly[j].x;\n    dy = poly[i].y - poly[j].y;\n\n    p += Math.sqrt(dx * dx + dy * dy) ;\n  }\n\n  return p;\n};\n\nCV.minEdgeLength = function(poly){\n  var len = poly.length, i = 0, j = len - 1,\n      min = Infinity, d, dx, dy;\n\n  for (; i < len; j = i ++){\n    dx = poly[i].x - poly[j].x;\n    dy = poly[i].y - poly[j].y;\n\n    d = dx * dx + dy * dy;\n\n    if (d < min){\n      min = d;\n    }\n  }\n\n  return Math.sqrt(min);\n};\n\nCV.countNonZero = function(imageSrc, square){\n  var src = imageSrc.data, height = square.height, width = square.width,\n      pos = square.x + (square.y * imageSrc.width),\n      span = imageSrc.width - width,\n      nz = 0, i, j;\n\n  for (i = 0; i < height; ++ i){\n\n    for (j = 0; j < width; ++ j){\n\n      if ( 0 !== src[pos ++] ){\n        ++ nz;\n      }\n    }\n\n    pos += span;\n  }\n\n  return nz;\n};\n\nCV.binaryBorder = function(imageSrc, dst){\n  var src = imageSrc.data, height = imageSrc.height, width = imageSrc.width,\n      posSrc = 0, posDst = 0, i, j;\n\n  for (j = -2; j < width; ++ j){\n    dst[posDst ++] = 0;\n  }\n\n  for (i = 0; i < height; ++ i){\n    dst[posDst ++] = 0;\n\n    for (j = 0; j < width; ++ j){\n      dst[posDst ++] = (0 === src[posSrc ++]? 0: 1);\n    }\n\n    dst[posDst ++] = 0;\n  }\n\n  for (j = -2; j < width; ++ j){\n    dst[posDst ++] = 0;\n  }\n\n  return dst;\n};\n';
  const arucoSource = `/*
Copyright (c) 2020 Damiano Falcioni
Copyright (c) 2011 Juan Mellado

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*
References:
- "ArUco: a minimal library for Augmented Reality applications based on OpenCv"
  http://www.uco.es/investiga/grupos/ava/node/26
- "js-aruco: a port to JavaScript of the ArUco library"
  https://github.com/jcmellado/js-aruco
*/

var AR = {};
var CV = this.CV || require('./cv').CV;
this.AR = AR;

AR.DICTIONARIES = {
  ARUCO: {
    nBits: 25,
    tau: 3,
    codeList: [0x1084210,0x1084217,0x1084209,0x108420e,0x10842f0,0x10842f7,0x10842e9,0x10842ee,0x1084130,0x1084137,0x1084129,0x108412e,0x10841d0,0x10841d7,0x10841c9,0x10841ce,0x1085e10,0x1085e17,0x1085e09,0x1085e0e,0x1085ef0,0x1085ef7,0x1085ee9,0x1085eee,0x1085d30,0x1085d37,0x1085d29,0x1085d2e,0x1085dd0,0x1085dd7,0x1085dc9,0x1085dce,0x1082610,0x1082617,0x1082609,0x108260e,0x10826f0,0x10826f7,0x10826e9,0x10826ee,0x1082530,0x1082537,0x1082529,0x108252e,0x10825d0,0x10825d7,0x10825c9,0x10825ce,0x1083a10,0x1083a17,0x1083a09,0x1083a0e,0x1083af0,0x1083af7,0x1083ae9,0x1083aee,0x1083930,0x1083937,0x1083929,0x108392e,0x10839d0,0x10839d7,0x10839c9,0x10839ce,0x10bc210,0x10bc217,0x10bc209,0x10bc20e,0x10bc2f0,0x10bc2f7,0x10bc2e9,0x10bc2ee,0x10bc130,0x10bc137,0x10bc129,0x10bc12e,0x10bc1d0,0x10bc1d7,0x10bc1c9,0x10bc1ce,0x10bde10,0x10bde17,0x10bde09,0x10bde0e,0x10bdef0,0x10bdef7,0x10bdee9,0x10bdeee,0x10bdd30,0x10bdd37,0x10bdd29,0x10bdd2e,0x10bddd0,0x10bddd7,0x10bddc9,0x10bddce,0x10ba610,0x10ba617,0x10ba609,0x10ba60e,0x10ba6f0,0x10ba6f7,0x10ba6e9,0x10ba6ee,0x10ba530,0x10ba537,0x10ba529,0x10ba52e,0x10ba5d0,0x10ba5d7,0x10ba5c9,0x10ba5ce,0x10bba10,0x10bba17,0x10bba09,0x10bba0e,0x10bbaf0,0x10bbaf7,0x10bbae9,0x10bbaee,0x10bb930,0x10bb937,0x10bb929,0x10bb92e,0x10bb9d0,0x10bb9d7,0x10bb9c9,0x10bb9ce,0x104c210,0x104c217,0x104c209,0x104c20e,0x104c2f0,0x104c2f7,0x104c2e9,0x104c2ee,0x104c130,0x104c137,0x104c129,0x104c12e,0x104c1d0,0x104c1d7,0x104c1c9,0x104c1ce,0x104de10,0x104de17,0x104de09,0x104de0e,0x104def0,0x104def7,0x104dee9,0x104deee,0x104dd30,0x104dd37,0x104dd29,0x104dd2e,0x104ddd0,0x104ddd7,0x104ddc9,0x104ddce,0x104a610,0x104a617,0x104a609,0x104a60e,0x104a6f0,0x104a6f7,0x104a6e9,0x104a6ee,0x104a530,0x104a537,0x104a529,0x104a52e,0x104a5d0,0x104a5d7,0x104a5c9,0x104a5ce,0x104ba10,0x104ba17,0x104ba09,0x104ba0e,0x104baf0,0x104baf7,0x104bae9,0x104baee,0x104b930,0x104b937,0x104b929,0x104b92e,0x104b9d0,0x104b9d7,0x104b9c9,0x104b9ce,0x1074210,0x1074217,0x1074209,0x107420e,0x10742f0,0x10742f7,0x10742e9,0x10742ee,0x1074130,0x1074137,0x1074129,0x107412e,0x10741d0,0x10741d7,0x10741c9,0x10741ce,0x1075e10,0x1075e17,0x1075e09,0x1075e0e,0x1075ef0,0x1075ef7,0x1075ee9,0x1075eee,0x1075d30,0x1075d37,0x1075d29,0x1075d2e,0x1075dd0,0x1075dd7,0x1075dc9,0x1075dce,0x1072610,0x1072617,0x1072609,0x107260e,0x10726f0,0x10726f7,0x10726e9,0x10726ee,0x1072530,0x1072537,0x1072529,0x107252e,0x10725d0,0x10725d7,0x10725c9,0x10725ce,0x1073a10,0x1073a17,0x1073a09,0x1073a0e,0x1073af0,0x1073af7,0x1073ae9,0x1073aee,0x1073930,0x1073937,0x1073929,0x107392e,0x10739d0,0x10739d7,0x10739c9,0x10739ce,0x1784210,0x1784217,0x1784209,0x178420e,0x17842f0,0x17842f7,0x17842e9,0x17842ee,0x1784130,0x1784137,0x1784129,0x178412e,0x17841d0,0x17841d7,0x17841c9,0x17841ce,0x1785e10,0x1785e17,0x1785e09,0x1785e0e,0x1785ef0,0x1785ef7,0x1785ee9,0x1785eee,0x1785d30,0x1785d37,0x1785d29,0x1785d2e,0x1785dd0,0x1785dd7,0x1785dc9,0x1785dce,0x1782610,0x1782617,0x1782609,0x178260e,0x17826f0,0x17826f7,0x17826e9,0x17826ee,0x1782530,0x1782537,0x1782529,0x178252e,0x17825d0,0x17825d7,0x17825c9,0x17825ce,0x1783a10,0x1783a17,0x1783a09,0x1783a0e,0x1783af0,0x1783af7,0x1783ae9,0x1783aee,0x1783930,0x1783937,0x1783929,0x178392e,0x17839d0,0x17839d7,0x17839c9,0x17839ce,0x17bc210,0x17bc217,0x17bc209,0x17bc20e,0x17bc2f0,0x17bc2f7,0x17bc2e9,0x17bc2ee,0x17bc130,0x17bc137,0x17bc129,0x17bc12e,0x17bc1d0,0x17bc1d7,0x17bc1c9,0x17bc1ce,0x17bde10,0x17bde17,0x17bde09,0x17bde0e,0x17bdef0,0x17bdef7,0x17bdee9,0x17bdeee,0x17bdd30,0x17bdd37,0x17bdd29,0x17bdd2e,0x17bddd0,0x17bddd7,0x17bddc9,0x17bddce,0x17ba610,0x17ba617,0x17ba609,0x17ba60e,0x17ba6f0,0x17ba6f7,0x17ba6e9,0x17ba6ee,0x17ba530,0x17ba537,0x17ba529,0x17ba52e,0x17ba5d0,0x17ba5d7,0x17ba5c9,0x17ba5ce,0x17bba10,0x17bba17,0x17bba09,0x17bba0e,0x17bbaf0,0x17bbaf7,0x17bbae9,0x17bbaee,0x17bb930,0x17bb937,0x17bb929,0x17bb92e,0x17bb9d0,0x17bb9d7,0x17bb9c9,0x17bb9ce,0x174c210,0x174c217,0x174c209,0x174c20e,0x174c2f0,0x174c2f7,0x174c2e9,0x174c2ee,0x174c130,0x174c137,0x174c129,0x174c12e,0x174c1d0,0x174c1d7,0x174c1c9,0x174c1ce,0x174de10,0x174de17,0x174de09,0x174de0e,0x174def0,0x174def7,0x174dee9,0x174deee,0x174dd30,0x174dd37,0x174dd29,0x174dd2e,0x174ddd0,0x174ddd7,0x174ddc9,0x174ddce,0x174a610,0x174a617,0x174a609,0x174a60e,0x174a6f0,0x174a6f7,0x174a6e9,0x174a6ee,0x174a530,0x174a537,0x174a529,0x174a52e,0x174a5d0,0x174a5d7,0x174a5c9,0x174a5ce,0x174ba10,0x174ba17,0x174ba09,0x174ba0e,0x174baf0,0x174baf7,0x174bae9,0x174baee,0x174b930,0x174b937,0x174b929,0x174b92e,0x174b9d0,0x174b9d7,0x174b9c9,0x174b9ce,0x1774210,0x1774217,0x1774209,0x177420e,0x17742f0,0x17742f7,0x17742e9,0x17742ee,0x1774130,0x1774137,0x1774129,0x177412e,0x17741d0,0x17741d7,0x17741c9,0x17741ce,0x1775e10,0x1775e17,0x1775e09,0x1775e0e,0x1775ef0,0x1775ef7,0x1775ee9,0x1775eee,0x1775d30,0x1775d37,0x1775d29,0x1775d2e,0x1775dd0,0x1775dd7,0x1775dc9,0x1775dce,0x1772610,0x1772617,0x1772609,0x177260e,0x17726f0,0x17726f7,0x17726e9,0x17726ee,0x1772530,0x1772537,0x1772529,0x177252e,0x17725d0,0x17725d7,0x17725c9,0x17725ce,0x1773a10,0x1773a17,0x1773a09,0x1773a0e,0x1773af0,0x1773af7,0x1773ae9,0x1773aee,0x1773930,0x1773937,0x1773929,0x177392e,0x17739d0,0x17739d7,0x17739c9,0x17739ce,0x984210,0x984217,0x984209,0x98420e,0x9842f0,0x9842f7,0x9842e9,0x9842ee,0x984130,0x984137,0x984129,0x98412e,0x9841d0,0x9841d7,0x9841c9,0x9841ce,0x985e10,0x985e17,0x985e09,0x985e0e,0x985ef0,0x985ef7,0x985ee9,0x985eee,0x985d30,0x985d37,0x985d29,0x985d2e,0x985dd0,0x985dd7,0x985dc9,0x985dce,0x982610,0x982617,0x982609,0x98260e,0x9826f0,0x9826f7,0x9826e9,0x9826ee,0x982530,0x982537,0x982529,0x98252e,0x9825d0,0x9825d7,0x9825c9,0x9825ce,0x983a10,0x983a17,0x983a09,0x983a0e,0x983af0,0x983af7,0x983ae9,0x983aee,0x983930,0x983937,0x983929,0x98392e,0x9839d0,0x9839d7,0x9839c9,0x9839ce,0x9bc210,0x9bc217,0x9bc209,0x9bc20e,0x9bc2f0,0x9bc2f7,0x9bc2e9,0x9bc2ee,0x9bc130,0x9bc137,0x9bc129,0x9bc12e,0x9bc1d0,0x9bc1d7,0x9bc1c9,0x9bc1ce,0x9bde10,0x9bde17,0x9bde09,0x9bde0e,0x9bdef0,0x9bdef7,0x9bdee9,0x9bdeee,0x9bdd30,0x9bdd37,0x9bdd29,0x9bdd2e,0x9bddd0,0x9bddd7,0x9bddc9,0x9bddce,0x9ba610,0x9ba617,0x9ba609,0x9ba60e,0x9ba6f0,0x9ba6f7,0x9ba6e9,0x9ba6ee,0x9ba530,0x9ba537,0x9ba529,0x9ba52e,0x9ba5d0,0x9ba5d7,0x9ba5c9,0x9ba5ce,0x9bba10,0x9bba17,0x9bba09,0x9bba0e,0x9bbaf0,0x9bbaf7,0x9bbae9,0x9bbaee,0x9bb930,0x9bb937,0x9bb929,0x9bb92e,0x9bb9d0,0x9bb9d7,0x9bb9c9,0x9bb9ce,0x94c210,0x94c217,0x94c209,0x94c20e,0x94c2f0,0x94c2f7,0x94c2e9,0x94c2ee,0x94c130,0x94c137,0x94c129,0x94c12e,0x94c1d0,0x94c1d7,0x94c1c9,0x94c1ce,0x94de10,0x94de17,0x94de09,0x94de0e,0x94def0,0x94def7,0x94dee9,0x94deee,0x94dd30,0x94dd37,0x94dd29,0x94dd2e,0x94ddd0,0x94ddd7,0x94ddc9,0x94ddce,0x94a610,0x94a617,0x94a609,0x94a60e,0x94a6f0,0x94a6f7,0x94a6e9,0x94a6ee,0x94a530,0x94a537,0x94a529,0x94a52e,0x94a5d0,0x94a5d7,0x94a5c9,0x94a5ce,0x94ba10,0x94ba17,0x94ba09,0x94ba0e,0x94baf0,0x94baf7,0x94bae9,0x94baee,0x94b930,0x94b937,0x94b929,0x94b92e,0x94b9d0,0x94b9d7,0x94b9c9,0x94b9ce,0x974210,0x974217,0x974209,0x97420e,0x9742f0,0x9742f7,0x9742e9,0x9742ee,0x974130,0x974137,0x974129,0x97412e,0x9741d0,0x9741d7,0x9741c9,0x9741ce,0x975e10,0x975e17,0x975e09,0x975e0e,0x975ef0,0x975ef7,0x975ee9,0x975eee,0x975d30,0x975d37,0x975d29,0x975d2e,0x975dd0,0x975dd7,0x975dc9,0x975dce,0x972610,0x972617,0x972609,0x97260e,0x9726f0,0x9726f7,0x9726e9,0x9726ee,0x972530,0x972537,0x972529,0x97252e,0x9725d0,0x9725d7,0x9725c9,0x9725ce,0x973a10,0x973a17,0x973a09,0x973a0e,0x973af0,0x973af7,0x973ae9,0x973aee,0x973930,0x973937,0x973929,0x97392e,0x9739d0,0x9739d7,0x9739c9,0x9739ce,0xe84210,0xe84217,0xe84209,0xe8420e,0xe842f0,0xe842f7,0xe842e9,0xe842ee,0xe84130,0xe84137,0xe84129,0xe8412e,0xe841d0,0xe841d7,0xe841c9,0xe841ce,0xe85e10,0xe85e17,0xe85e09,0xe85e0e,0xe85ef0,0xe85ef7,0xe85ee9,0xe85eee,0xe85d30,0xe85d37,0xe85d29,0xe85d2e,0xe85dd0,0xe85dd7,0xe85dc9,0xe85dce,0xe82610,0xe82617,0xe82609,0xe8260e,0xe826f0,0xe826f7,0xe826e9,0xe826ee,0xe82530,0xe82537,0xe82529,0xe8252e,0xe825d0,0xe825d7,0xe825c9,0xe825ce,0xe83a10,0xe83a17,0xe83a09,0xe83a0e,0xe83af0,0xe83af7,0xe83ae9,0xe83aee,0xe83930,0xe83937,0xe83929,0xe8392e,0xe839d0,0xe839d7,0xe839c9,0xe839ce,0xebc210,0xebc217,0xebc209,0xebc20e,0xebc2f0,0xebc2f7,0xebc2e9,0xebc2ee,0xebc130,0xebc137,0xebc129,0xebc12e,0xebc1d0,0xebc1d7,0xebc1c9,0xebc1ce,0xebde10,0xebde17,0xebde09,0xebde0e,0xebdef0,0xebdef7,0xebdee9,0xebdeee,0xebdd30,0xebdd37,0xebdd29,0xebdd2e,0xebddd0,0xebddd7,0xebddc9,0xebddce,0xeba610,0xeba617,0xeba609,0xeba60e,0xeba6f0,0xeba6f7,0xeba6e9,0xeba6ee,0xeba530,0xeba537,0xeba529,0xeba52e,0xeba5d0,0xeba5d7,0xeba5c9,0xeba5ce,0xebba10,0xebba17,0xebba09,0xebba0e,0xebbaf0,0xebbaf7,0xebbae9,0xebbaee,0xebb930,0xebb937,0xebb929,0xebb92e,0xebb9d0,0xebb9d7,0xebb9c9,0xebb9ce,0xe4c210,0xe4c217,0xe4c209,0xe4c20e,0xe4c2f0,0xe4c2f7,0xe4c2e9,0xe4c2ee,0xe4c130,0xe4c137,0xe4c129,0xe4c12e,0xe4c1d0,0xe4c1d7,0xe4c1c9,0xe4c1ce,0xe4de10,0xe4de17,0xe4de09,0xe4de0e,0xe4def0,0xe4def7,0xe4dee9,0xe4deee,0xe4dd30,0xe4dd37,0xe4dd29,0xe4dd2e,0xe4ddd0,0xe4ddd7,0xe4ddc9,0xe4ddce,0xe4a610,0xe4a617,0xe4a609,0xe4a60e,0xe4a6f0,0xe4a6f7,0xe4a6e9,0xe4a6ee,0xe4a530,0xe4a537,0xe4a529,0xe4a52e,0xe4a5d0,0xe4a5d7,0xe4a5c9,0xe4a5ce,0xe4ba10,0xe4ba17,0xe4ba09,0xe4ba0e,0xe4baf0,0xe4baf7,0xe4bae9,0xe4baee,0xe4b930,0xe4b937,0xe4b929,0xe4b92e,0xe4b9d0,0xe4b9d7,0xe4b9c9,0xe4b9ce,0xe74210,0xe74217,0xe74209,0xe7420e,0xe742f0,0xe742f7,0xe742e9,0xe742ee,0xe74130,0xe74137,0xe74129,0xe7412e,0xe741d0,0xe741d7,0xe741c9,0xe741ce,0xe75e10,0xe75e17,0xe75e09,0xe75e0e,0xe75ef0,0xe75ef7,0xe75ee9,0xe75eee,0xe75d30,0xe75d37,0xe75d29,0xe75d2e,0xe75dd0,0xe75dd7,0xe75dc9,0xe75dce,0xe72610,0xe72617,0xe72609,0xe7260e,0xe726f0,0xe726f7,0xe726e9,0xe726ee,0xe72530,0xe72537,0xe72529,0xe7252e,0xe725d0,0xe725d7,0xe725c9,0xe725ce,0xe73a10,0xe73a17,0xe73a09,0xe73a0e,0xe73af0,0xe73af7,0xe73ae9,0xe73aee,0xe73930,0xe73937,0xe73929,0xe7392e,0xe739d0,0xe739d7,0xe739c9]
  },
  ARUCO_MIP_36h12: {
    nBits: 36,
    tau: 12,
    codeList: [0xd2b63a09d,0x6001134e5,0x1206fbe72,0xff8ad6cb4,0x85da9bc49,0xb461afe9c,0x6db51fe13,0x5248c541f,0x8f34503,0x8ea462ece,0xeac2be76d,0x1af615c44,0xb48a49f27,0x2e4e1283b,0x78b1f2fa8,0x27d34f57e,0x89222fff1,0x4c1669406,0xbf49b3511,0xdc191cd5d,0x11d7c3f85,0x16a130e35,0xe29f27eff,0x428d8ae0c,0x90d548477,0x2319cbc93,0xc3b0c3dfc,0x424bccc9,0x2a081d630,0x762743d96,0xd0645bf19,0xf38d7fd60,0xc6cbf9a10,0x3c1be7c65,0x276f75e63,0x4490a3f63,0xda60acd52,0x3cc68df59,0xab46f9dae,0x88d533d78,0xb6d62ec21,0xb3c02b646,0x22e56d408,0xac5f5770a,0xaaa993f66,0x4caa07c8d,0x5c9b4f7b0,0xaa9ef0e05,0x705c5750,0xac81f545e,0x735b91e74,0x8cc35cee4,0xe44694d04,0xb5e121de0,0x261017d0f,0xf1d439eb5,0xa1a33ac96,0x174c62c02,0x1ee27f716,0x8b1c5ece9,0x6a05b0c6a,0xd0568dfc,0x192d25e5f,0x1adbeccc8,0xcfec87f00,0xd0b9dde7a,0x88dcef81e,0x445681cb9,0xdbb2ffc83,0xa48d96df1,0xb72cc2e7d,0xc295b53f,0xf49832704,0x9968edc29,0x9e4e1af85,0x8683e2d1b,0x810b45c04,0x6ac44bfe2,0x645346615,0x3990bd598,0x1c9ed0f6a,0xc26729d65,0x83993f795,0x3ac05ac5d,0x357adff3b,0xd5c05565,0x2f547ef44,0x86c115041,0x640fd9e5f,0xce08bbcf7,0x109bb343e,0xc21435c92,0x35b4dfce4,0x459752cf2,0xec915b82c,0x51881eed0,0x2dda7dc97,0x2e0142144,0x42e890f99,0x9a8856527,0x8e80d9d80,0x891cbcf34,0x25dd82410,0x239551d34,0x8fe8f0c70,0x94106a970,0x82609b40c,0xfc9caf36,0x688181d11,0x718613c08,0xf1ab7629,0xa357bfc18,0x4c03b7a46,0x204dedce6,0xad6300d37,0x84cc4cd09,0x42160e5c4,0x87d2adfa8,0x7850e7749,0x4e750fc7c,0xbf2e5dfda,0xd88324da5,0x234b52f80,0x378204514,0xabdf2ad53,0x365e78ef9,0x49caa6ca2,0x3c39ddf3,0xc68c5385d,0x5bfcbbf67,0x623241e21,0xabc90d5cc,0x388c6fe85,0xda0e2d62d,0x10855dfe9,0x4d46efd6b,0x76ea12d61,0x9db377d3d,0xeed0efa71,0xe6ec3ae2f,0x441faee83,0xba19c8ff5,0x313035eab,0x6ce8f7625,0x880dab58d,0x8d3409e0d,0x2be92ee21,0xd60302c6c,0x469ffc724,0x87eebeed3,0x42587ef7a,0x7a8cc4e52,0x76a437650,0x999e41ef4,0x7d0969e42,0xc02baf46b,0x9259f3e47,0x2116a1dc0,0x9f2de4d84,0xeffac29,0x7b371ff8c,0x668339da9,0xd010aee3f,0x1cd00b4c0,0x95070fc3b,0xf84c9a770,0x38f863d76,0x3646ff045,0xce1b96412,0x7a5d45da8,0x14e00ef6c,0x5e95abfd8,0xb2e9cb729,0x36c47dd7,0xb8ee97c6b,0xe9e8f657,0xd4ad2ef1a,0x8811c7f32,0x47bde7c31,0x3adadfb64,0x6e5b28574,0x33e67cd91,0x2ab9fdd2d,0x8afa67f2b,0xe6a28fc5e,0x72049cdbd,0xae65dac12,0x1251a4526,0x1089ab841,0xe2f096ee0,0xb0caee573,0xfd6677e86,0x444b3f518,0xbe8b3a56a,0x680a75cfc,0xac02baea8,0x97d815e1c,0x1d4386e08,0x1a14f5b0e,0xe658a8d81,0xa3868efa7,0x3668a9673,0xe8fc53d85,0x2e2b7edd5,0x8b2470f13,0xf69795f32,0x4589ffc8e,0x2e2080c9c,0x64265f7d,0x3d714dd10,0x1692c6ef1,0x3e67f2f49,0x5041dad63,0x1a1503415,0x64c18c742,0xa72eec35,0x1f0f9dc60,0xa9559bc67,0xf32911d0d,0x21c0d4ffc,0xe01cef5b0,0x4e23a3520,0xaa4f04e49,0xe1c4fcc43,0x208e8f6e8,0x8486774a5,0x9e98c7558,0x2c59fb7dc,0x9446a4613,0x8292dcc2e,0x4d61631,0xd05527809,0xa0163852d,0x8f657f639,0xcca6c3e37,0xcb136bc7a,0xfc5a83e53,0x9aa44fc30,0xbdec1bd3c,0xe020b9f7c,0x4b8f35fb0,0xb8165f637,0x33dc88d69,0x10a2f7e4d,0xc8cb5ff53,0xde259ff6b,0x46d070dd4,0x32d3b9741,0x7075f1c04,0x4d58dbea0]
  }
};

AR.Dictionary = function (dicName) {
  this.codes = {};
  this.codeList = [];
  this.tau = 0;
  this._initialize(dicName);
};

AR.Dictionary.prototype._initialize = function (dicName) {
  this.codes = {};
  this.codeList = [];
  this.tau = 0;
  this.nBits = 0;
  this.markSize = 0;
  this.dicName = dicName;
  var dictionary = AR.DICTIONARIES[dicName];
  if (!dictionary)
    throw 'The dictionary "' + dicName + '" is not recognized.';
  
  this.nBits = dictionary.nBits;
  this.markSize = Math.sqrt(dictionary.nBits) + 2;
  for (var i = 0; i < dictionary.codeList.length; i++) {
    var code = null;
    if (typeof dictionary.codeList[i] === 'number')
      code = this._hex2bin(dictionary.codeList[i], dictionary.nBits);
    if (typeof dictionary.codeList[i] === 'string')
      code = this._hex2bin(parseInt(dictionary.codeList[i], 16), dictionary.nBits);
    if (Array.isArray(dictionary.codeList[i])) 
      code = this._bytes2bin(dictionary.codeList[i], dictionary.nBits);
    if (code === null) 
      throw 'Invalid code ' + i + ' in dictionary ' + dicName + ': ' + JSON.stringify(dictionary.codeList[i]);
    if (code.length != dictionary.nBits)
      throw 'The code ' + i + ' in dictionary ' + dicName + ' is not ' +  dictionary.nBits + ' bits long but ' + code.length + ': ' + code;
    this.codeList.push(code);
    this.codes[code] = {
      id: i
    };
  }
  this.tau = dictionary.tau || this._calculateTau();
};

AR.Dictionary.prototype.find = function (bits) {
  var val = '',
    i, j;
  for (i = 0; i < bits.length; i++) {
    var bitRow = bits[i];
    for (j = 0; j < bitRow.length; j++) {
      val += bitRow[j];
    }
  }
  var minFound = this.codes[val];
  if (minFound)
    return {
      id: minFound.id,
      distance: 0
    };

  for (i = 0; i < this.codeList.length; i++) {
    var code = this.codeList[i];
    var distance = this._hammingDistance(val, code);
    if (this._hammingDistance(val, code) < this.tau) {
      if (!minFound || minFound.distance > distance) {
        minFound = {
          id: this.codes[code].id,
          distance: distance
        };
      }
    }
  }
  return minFound;
};

AR.Dictionary.prototype._hex2bin = function (hex, nBits) {
  return hex.toString(2).padStart(nBits, '0');
};

AR.Dictionary.prototype._bytes2bin = function (byteList, nBits) {
  var bits = '', byte;
  for (byte of byteList) {
    bits += byte.toString(2).padStart(bits.length + 8 > nBits?nBits - bits.length:8, '0');
  }
  return bits;
};

AR.Dictionary.prototype._hammingDistance = function (str1, str2) {
  if (str1.length != str2.length)
    throw 'Hamming distance calculation require inputs of the same length';
  var distance = 0,
    i;
  for (i = 0; i < str1.length; i++)
    if (str1[i] !== str2[i])
      distance += 1;
  return distance;
};

AR.Dictionary.prototype._calculateTau = function () {
  var tau = Number.MAX_VALUE;
  for(var i=0;i<this.codeList.length;i++)
    for(var j=i+1;j<this.codeList.length;j++) {
      var distance = this._hammingDistance(this.codeList[i], this.codeList[j]);
      tau = distance < tau ? distance : tau;
    }
  return tau;
};

AR.Dictionary.prototype.generateSVG = function (id) {
  var code = this.codeList[id];
  if (code == null)
    throw 'The id "' + id + '" is not valid for the dictionary "' + this.dicName + '". ID must be between 0 and ' + (this.codeList.length-1) + ' included.';
  var size = this.markSize - 2;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+ (size+4) + ' ' + (size+4) + '">';
  svg += '<rect x="0" y="0" width="' + (size+4) + '" height="' + (size+4) + '" fill="white"/>';
  svg += '<rect x="1" y="1" width="' + (size+2) + '" height="' + (size+2) + '" fill="black"/>';
  for(var y=0;y<size;y++) {
    for(var x=0;x<size;x++) {
      if (code[y*size+x]=='1') 
        svg += '<rect x="' + (x+2) + '" y="' + (y+2) + '" width="1" height="1" fill="white"/>';
    }
  }
  svg += '</svg>';
  return svg;
};

AR.Marker = function (id, corners, hammingDistance) {
  this.id = id;
  this.corners = corners;
  this.hammingDistance = hammingDistance;
};

AR.Detector = function (config) {
  config = config || {};
  this.grey = new CV.Image();
  this.thres = new CV.Image();
  this.homography = new CV.Image();
  this.binary = [];
  this.contours = [];
  this.polys = [];
  this.candidates = [];
  config.dictionaryName = config.dictionaryName || 'ARUCO_MIP_36h12';
  this.dictionary = new AR.Dictionary(config.dictionaryName);
  this.dictionary.tau = config.maxHammingDistance != null ? config.maxHammingDistance : this.dictionary.tau;
};

AR.Detector.prototype.detectImage = function (width, height, data) {
  return this.detect({
    width: width,
    height: height,
    data: data
  });
};

AR.Detector.prototype.detectStreamInit = function (width, height, callback) {
  this.streamConfig = {};
  this.streamConfig.width = width;
  this.streamConfig.height = height;
  this.streamConfig.imageSize = width * height * 4; //provided image must be a sequence of rgba bytes (4 bytes represent a pixel)
  this.streamConfig.index = 0;
  this.streamConfig.imageData = new Uint8ClampedArray(this.streamConfig.imageSize);
  this.streamConfig.callback = callback || function (image, markerList) {};
};

//accept data chunks of different sizes
AR.Detector.prototype.detectStream = function (data) {
  for (var i = 0; i < data.length; i++) {
    this.streamConfig.imageData[this.streamConfig.index] = data[i];
    this.streamConfig.index = (this.streamConfig.index + 1) % this.streamConfig.imageSize;
    if (this.streamConfig.index == 0) {
      var image = {
        width: this.streamConfig.width,
        height: this.streamConfig.height,
        data: this.streamConfig.imageData
      };
      var markerList = this.detect(image);
      this.streamConfig.callback(image, markerList);
    }
  }
};

AR.Detector.prototype.detectMJPEGStreamInit = function (width, height, callback, decoderFn) {
  this.mjpeg = {
    decoderFn: decoderFn,
    chunks: [],
    SOI: [0xff, 0xd8],
    EOI: [0xff, 0xd9]
  };
  this.detectStreamInit(width, height, callback);
};

AR.Detector.prototype.detectMJPEGStream = function (chunk) {
  var eoiPos = chunk.findIndex(function (element, index, array) {
    return this.mjpeg.EOI[0] == element && array.length > index + 1 && this.mjpeg.EOI[1] == array[index + 1];
  });
  var soiPos = chunk.findIndex(function (element, index, array) {
    return this.mjpeg.SOI[0] == element && array.length > index + 1 && this.mjpeg.SOI[1] == array[index + 1];
  });

  if (eoiPos === -1) {
    this.mjpeg.chunks.push(chunk);
  } else {
    var part1 = chunk.slice(0, eoiPos + 2);
    if (part1.length) {
      this.mjpeg.chunks.push(part1);
    }
    if (this.mjpeg.chunks.length) {
      var jpegImage = this.mjpeg.chunks.flat();
      var rgba = this.mjpeg.decoderFn(jpegImage);
      this.detectStream(rgba);
    }
    this.mjpeg.chunks = [];
  }
  if (soiPos > -1) {
    this.mjpeg.chunks = [];
    this.mjpeg.chunks.push(chunk.slice(soiPos));
  }
};

AR.Detector.prototype.detect = function (image) {
  CV.grayscale(image, this.grey);
  CV.adaptiveThreshold(this.grey, this.thres, 2, 7);

  this.contours = CV.findContours(this.thres, this.binary);
  //Scale Fix: https://stackoverflow.com/questions/35936397/marker-detection-on-paper-sheet-using-javascript
  //this.candidates = this.findCandidates(this.contours, image.width * 0.20, 0.05, 10);
  this.candidates = this.findCandidates(this.contours, image.width * 0.01, 0.05, 10);
  this.candidates = this.clockwiseCorners(this.candidates);
  this.candidates = this.notTooNear(this.candidates, 10);

  return this.findMarkers(this.grey, this.candidates, 49);
};

AR.Detector.prototype.findCandidates = function (contours, minSize, epsilon, minLength) {
  var candidates = [],
    len = contours.length,
    contour, poly, i;

  this.polys = [];

  for (i = 0; i < len; ++i) {
    contour = contours[i];

    if (contour.length >= minSize) {
      poly = CV.approxPolyDP(contour, contour.length * epsilon);

      this.polys.push(poly);

      if ((4 === poly.length) && (CV.isContourConvex(poly))) {

        if (CV.minEdgeLength(poly) >= minLength) {
          candidates.push(poly);
        }
      }
    }
  }

  return candidates;
};

AR.Detector.prototype.clockwiseCorners = function (candidates) {
  var len = candidates.length,
    dx1, dx2, dy1, dy2, swap, i;

  for (i = 0; i < len; ++i) {
    dx1 = candidates[i][1].x - candidates[i][0].x;
    dy1 = candidates[i][1].y - candidates[i][0].y;
    dx2 = candidates[i][2].x - candidates[i][0].x;
    dy2 = candidates[i][2].y - candidates[i][0].y;

    if ((dx1 * dy2 - dy1 * dx2) < 0) {
      swap = candidates[i][1];
      candidates[i][1] = candidates[i][3];
      candidates[i][3] = swap;
    }
  }

  return candidates;
};

AR.Detector.prototype.notTooNear = function (candidates, minDist) {
  var notTooNear = [],
    len = candidates.length,
    dist, dx, dy, i, j, k;

  for (i = 0; i < len; ++i) {

    for (j = i + 1; j < len; ++j) {
      dist = 0;

      for (k = 0; k < 4; ++k) {
        dx = candidates[i][k].x - candidates[j][k].x;
        dy = candidates[i][k].y - candidates[j][k].y;

        dist += dx * dx + dy * dy;
      }

      if ((dist / 4) < (minDist * minDist)) {

        if (CV.perimeter(candidates[i]) < CV.perimeter(candidates[j])) {
          candidates[i].tooNear = true;
        } else {
          candidates[j].tooNear = true;
        }
      }
    }
  }

  for (i = 0; i < len; ++i) {
    if (!candidates[i].tooNear) {
      notTooNear.push(candidates[i]);
    }
  }

  return notTooNear;
};

AR.Detector.prototype.findMarkers = function (imageSrc, candidates, warpSize) {
  var markers = [],
    len = candidates.length,
    candidate, marker, i;

  for (i = 0; i < len; ++i) {
    candidate = candidates[i];

    CV.warp(imageSrc, this.homography, candidate, warpSize);

    CV.threshold(this.homography, this.homography, CV.otsu(this.homography));

    marker = this.getMarker(this.homography, candidate);
    if (marker) {
      markers.push(marker);
    }
  }

  return markers;
};

AR.Detector.prototype.getMarker = function (imageSrc, candidate) {
  var markSize = this.dictionary.markSize;
  var width = (imageSrc.width / markSize) >>> 0,
    minZero = (width * width) >> 1,
    bits = [],
    rotations = [],
    square, inc, i, j;

  for (i = 0; i < markSize; ++i) {
    inc = (0 === i || (markSize - 1) === i) ? 1 : (markSize - 1);

    for (j = 0; j < markSize; j += inc) {
      square = {
        x: j * width,
        y: i * width,
        width: width,
        height: width
      };
      if (CV.countNonZero(imageSrc, square) > minZero) {
        return null;
      }
    }
  }

  for (i = 0; i < markSize - 2; ++i) {
    bits[i] = [];

    for (j = 0; j < markSize - 2; ++j) {
      square = {
        x: (j + 1) * width,
        y: (i + 1) * width,
        width: width,
        height: width
      };

      bits[i][j] = CV.countNonZero(imageSrc, square) > minZero ? 1 : 0;
    }
  }

  rotations[0] = bits;

  var foundMin = null;
  var rot = 0;
  for (i = 0; i < 4; i++) {
    var found = this.dictionary.find(rotations[i]);
    if (found && (foundMin === null || found.distance < foundMin.distance)) {
      foundMin = found;
      rot = i;
      if (foundMin.distance === 0)
        break;
    }
    rotations[i + 1] = this.rotate(rotations[i]);
  }

  if (foundMin)
    return new AR.Marker(foundMin.id, this.rotate2(candidate, 4 - rot), foundMin.distance);

  return null;
};

AR.Detector.prototype.rotate = function (src) {
  var dst = [],
    len = src.length,
    i, j;

  for (i = 0; i < len; ++i) {
    dst[i] = [];
    for (j = 0; j < src[i].length; ++j) {
      dst[i][j] = src[src[i].length - j - 1][i];
    }
  }

  return dst;
};

AR.Detector.prototype.rotate2 = function (src, rotation) {
  var dst = [],
    len = src.length,
    i;

  for (i = 0; i < len; ++i) {
    dst[i] = src[(rotation + i) % len];
  }

  return dst;
};
`;
  let _arucoLoaded = false;
  function _ensureArucoLibraryLoaded() {
    if (_arucoLoaded) return;
    new Function(cvSource).call(globalThis);
    new Function(arucoSource).call(globalThis);
    _arucoLoaded = true;
  }
  const MIN_MARKER_AREA = 200;
  class ArucoDetector {
    constructor() {
      _ensureArucoLibraryLoaded();
      const AR = globalThis.AR;
      if (!AR || typeof AR.Detector !== "function") {
        throw new Error(
          "[ArucoDetector] globalThis.AR.Detector is not available after loading js-aruco2 — the library source may have changed shape."
        );
      }
      this._detector = new AR.Detector();
      this._canvas = document.createElement("canvas");
      this._ctx = this._canvas.getContext("2d", { willReadFrequently: true });
      this._lastMarkers = [];
    }
    // ─────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────
    /**
     * Detect ArUco markers in the current video frame.
     *
     * @param {HTMLVideoElement} video  — must be playing with videoWidth/videoHeight set
     * @returns {Array<{id:number, corners:Array<{x:number,y:number}>, center:{x:number,y:number}}>}
     */
    detect(video) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        return this._lastMarkers;
      }
      if (this._canvas.width !== w || this._canvas.height !== h) {
        this._canvas.width = w;
        this._canvas.height = h;
      }
      this._ctx.drawImage(video, 0, 0, w, h);
      const imageData = this._ctx.getImageData(0, 0, w, h);
      let raw;
      try {
        raw = this._detector.detect(imageData);
      } catch (err) {
        console.warn("[ArucoDetector] Detection error:", err);
        return this._lastMarkers;
      }
      this._lastMarkers = raw.filter((m) => this._quadArea(m.corners) >= MIN_MARKER_AREA).map((m) => ({
        id: m.id,
        corners: m.corners.map((c) => ({ x: c.x, y: c.y })),
        center: this._centroid(m.corners)
      }));
      return this._lastMarkers;
    }
    /**
     * Return the most recent detection result without re-running detection.
     * Useful when you want the data channel payload between detect() calls.
     * @returns {Array}
     */
    getLastMarkers() {
      return this._lastMarkers;
    }
    /** Release canvas resources. Call when the sender stops capture. */
    destroy() {
      this._canvas = null;
      this._ctx = null;
      this._lastMarkers = [];
    }
    // ─────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────
    /**
     * Shoelace formula — area of a quad defined by four corners.
     * Used to filter out tiny false-positive detections.
     * @param {Array<{x:number,y:number}>} corners  — must have exactly 4 points
     * @returns {number}  pixel area
     */
    _quadArea(corners) {
      let area = 0;
      const n = corners.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += corners[i].x * corners[j].y;
        area -= corners[j].x * corners[i].y;
      }
      return Math.abs(area) / 2;
    }
    /**
     * Centroid of a polygon (mean of vertices).
     * @param {Array<{x:number,y:number}>} pts
     * @returns {{x:number,y:number}}
     */
    _centroid(pts) {
      const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return { x: sum.x / pts.length, y: sum.y / pts.length };
    }
  }
  const SUPPORT_TIMEOUT_MS = 2e3;
  class OrientationTracker {
    constructor() {
      this._orientation = null;
      this._handler = null;
      this._active = false;
      this._firstEventResolver = null;
    }
    // ─────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────
    /**
     * Request permission (iOS 13+) and start listening.
     * MUST be called from inside a user gesture handler (button click).
     *
     * @returns {Promise<void>}
     * @throws  if permission is denied or the API is unavailable
     */
    async start() {
      if (this._active) return;
      await this._requestPermission();
      this._handler = (e) => {
        this._orientation = {
          pitch: e.beta ?? null,
          // −180 to +180
          roll: e.gamma ?? null,
          // −90  to +90
          yaw: e.alpha ?? null
          // 0    to 360
        };
        if (this._firstEventResolver) {
          this._firstEventResolver();
          this._firstEventResolver = null;
        }
      };
      window.addEventListener("deviceorientation", this._handler, true);
      this._active = true;
      await this._awaitFirstEvent();
    }
    /**
     * Return the most recent orientation snapshot, or null if not started / no data.
     * @returns {{pitch:number|null, roll:number|null, yaw:number|null}|null}
     */
    getOrientation() {
      return this._active ? this._orientation : null;
    }
    /**
     * Check whether orientation tracking is available without starting it.
     * Safe to call any time (no user gesture required).
     * @returns {boolean}
     */
    static isSupported() {
      return typeof DeviceOrientationEvent !== "undefined";
    }
    /** Stop listening and release resources. */
    stop() {
      if (this._handler) {
        window.removeEventListener("deviceorientation", this._handler, true);
        this._handler = null;
      }
      this._active = false;
      this._orientation = null;
    }
    // ─────────────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────────────
    /**
     * Request DeviceOrientationEvent permission on iOS 13+.
     * On all other platforms this is a no-op.
     */
    async _requestPermission() {
      if (!OrientationTracker.isSupported()) {
        throw new Error(
          "DeviceOrientationEvent is not supported in this browser. Orientation tracking requires a mobile device."
        );
      }
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        let permission;
        try {
          permission = await DeviceOrientationEvent.requestPermission();
        } catch (err) {
          throw new Error(
            "DeviceOrientationEvent.requestPermission() must be called from a user gesture (e.g. button click). " + err.message
          );
        }
        if (permission !== "granted") {
          throw new Error(
            `Orientation permission ${permission}. The user must tap "Allow" to enable pitch and roll tracking.`
          );
        }
      }
    }
    /**
     * Wait for the first deviceorientation event or timeout.
     * If the device does not fire events within SUPPORT_TIMEOUT_MS we warn but
     * do not throw — some Android models fire slowly on first attach.
     */
    _awaitFirstEvent() {
      return new Promise((resolve) => {
        if (this._orientation) {
          resolve();
          return;
        }
        this._firstEventResolver = resolve;
        setTimeout(() => {
          if (this._firstEventResolver) {
            this._firstEventResolver = null;
            console.warn(
              `[OrientationTracker] No deviceorientation event received within ${SUPPORT_TIMEOUT_MS} ms. The device may not support orientation tracking.`
            );
            resolve();
          }
        }, SUPPORT_TIMEOUT_MS);
      });
    }
  }
  class VPSProvider {
    /**
     * Connect to the VPS backend and prepare for pose queries.
     * Must be called from a user-gesture handler (required by WebXR).
     * @returns {Promise<void>}
     */
    async init() {
      throw new Error("VPSProvider.init() must be implemented by subclass");
    }
    /**
     * Return the most recent pose, or null if not yet localised.
     * @returns {Promise<VPSPose|null>}
     */
    async getPose() {
      throw new Error("VPSProvider.getPose() must be implemented by subclass");
    }
    /**
     * Register a named spatial anchor at the given pose.
     * In Phase 1 (WebXR) these are stored in memory only.
     * In Phase 2 (Multiset) they persist across sessions via MapSet.
     * @param {string}   name
     * @param {VPSPose}  pose
     * @returns {Promise<string>}  anchor ID
     */
    async registerAnchor(name, pose) {
      throw new Error("VPSProvider.registerAnchor() must be implemented by subclass");
    }
    /**
     * Tear down the session and release resources.
     */
    destroy() {
      throw new Error("VPSProvider.destroy() must be implemented by subclass");
    }
  }
  const RAD = 180 / Math.PI;
  const POSE_STALE_MS = 200;
  class WebXRProvider extends VPSProvider {
    constructor() {
      super();
      this._session = null;
      this._refSpace = null;
      this._lastPose = null;
      this._anchors = /* @__PURE__ */ new Map();
      this._raf = null;
      this._running = false;
    }
    // ─────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────
    /**
     * Start a WebXR immersive-ar session.
     * Must be called from a user gesture handler.
     * @throws if WebXR is unavailable or the device does not support AR
     */
    async init() {
      if (!navigator.xr) {
        throw new Error(
          "WebXR not available. Ensure the page is served over HTTPS and the device supports ARCore (Android Chrome) or ARKit (iOS Safari 15.4+)."
        );
      }
      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!supported) {
        throw new Error(
          "immersive-ar session not supported on this device. ARCore or ARKit integration is required for WebXRProvider."
        );
      }
      this._session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["anchors", "hit-test"]
      });
      this._refSpace = await this._session.requestReferenceSpace("local-floor");
      this._session.addEventListener("end", () => {
        this._running = false;
        this._session = null;
      });
      this._running = true;
      this._session.requestAnimationFrame((t, f) => this._tick(t, f));
      console.log("[WebXRProvider] AR session started");
    }
    /**
     * Return the most recent pose captured from the XR frame loop.
     * Returns null if not yet initialised or if the last pose is stale.
     * @returns {Promise<import('./vps-provider.js').VPSPose|null>}
     */
    async getPose() {
      if (!this._lastPose) return null;
      if (performance.now() - this._lastPose.timestamp > POSE_STALE_MS) return null;
      return this._lastPose;
    }
    /**
     * Register a named spatial anchor in memory.
     * In Phase 1 anchors are not persistent — they exist only for this session.
     * The MultisetProvider in Phase 2 will persist them via the MapSet API.
     * @param {string} name
     * @param {import('./vps-provider.js').VPSPose} pose
     * @returns {Promise<string>} anchor ID
     */
    async registerAnchor(name, pose) {
      const id = `webxr-anchor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this._anchors.set(id, { name, pose });
      console.log(`[WebXRProvider] Anchor registered locally: ${name} → ${id}`);
      return id;
    }
    /** End the XR session and clean up. */
    destroy() {
      this._running = false;
      if (this._session) {
        this._session.end().catch(() => {
        });
        this._session = null;
      }
      this._lastPose = null;
      this._anchors.clear();
      console.log("[WebXRProvider] Session destroyed");
    }
    // ─────────────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────────────
    /**
     * XRSession frame callback — runs every display frame (~60 fps).
     * Extracts position + orientation from XRViewerPose and converts
     * the orientation quaternion to Euler angles for the data channel.
     * @param {number}   _time  DOMHighResTimeStamp (unused; we use performance.now())
     * @param {XRFrame}  frame
     */
    _tick(_time, frame) {
      var _a;
      if (!this._running) return;
      try {
        const viewerPose = frame.getViewerPose(this._refSpace);
        if (viewerPose) {
          const { x, y, z } = viewerPose.transform.position;
          const q = viewerPose.transform.orientation;
          const yaw = Math.atan2(
            2 * (q.w * q.y - q.z * q.x),
            1 - 2 * (q.y * q.y + q.x * q.x)
          ) * RAD;
          const pitch = Math.asin(Math.max(-1, Math.min(
            1,
            2 * (q.w * q.x + q.y * q.z)
          ))) * RAD;
          const roll = Math.atan2(
            2 * (q.w * q.z - q.x * q.y),
            1 - 2 * (q.x * q.x + q.z * q.z)
          ) * RAD;
          this._lastPose = {
            position: { x, y, z },
            orientation: { yaw, pitch, roll },
            confidence: 0.85,
            // WebXR doesn't expose localisation confidence; use fixed value
            timestamp: performance.now()
          };
        }
      } catch (err) {
        console.warn("[WebXRProvider] Frame error:", err);
      }
      (_a = this._session) == null ? void 0 : _a.requestAnimationFrame((t, f) => this._tick(t, f));
    }
  }
  function createVPSProvider() {
    return new WebXRProvider();
  }
  async function checkVPSSupport() {
    if (!navigator.xr) {
      return {
        supported: false,
        reason: "WebXR is not available. Use Android Chrome or iOS Safari 15.4+ over HTTPS."
      };
    }
    try {
      const ok = await navigator.xr.isSessionSupported("immersive-ar");
      return ok ? { supported: true, reason: null } : { supported: false, reason: "This device does not support immersive-ar (ARCore/ARKit required)." };
    } catch {
      return { supported: false, reason: "WebXR support check failed." };
    }
  }
  window.ArucoDetector = ArucoDetector;
  window.OrientationTracker = OrientationTracker;
  window.createVPSProvider = createVPSProvider;
  window.checkVPSSupport = checkVPSSupport;
  window._bimBundleReady = true;
  document.dispatchEvent(new CustomEvent("bim:bundle:ready", { bubbles: false }));
  console.log(
    "[BIM Bundle] Ready — ArucoDetector, OrientationTracker, VPS factory loaded"
  );
})();
//# sourceMappingURL=bundle.js.map
