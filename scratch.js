function draw (_a25) {var _v26
  var _v13,_v14
  _g8.push(false);_g4.push(3);_g3.push(_g9);
  _g10.pushPtr(_g11, 0, 0, 0, 0, false, 5126)
  _v13 = _g12.count;
  _v14 = _a25
  var _v17,_v20,_v22
  _v17 = _g16(_v13, 0, _v14)
  if (typeof _v17 === 'number') {
    _g15.push([_v17])
  } else {
    _g15.push(_v17)
  }
  _v20 = _g19(_v13, 0, _v14)
  if (typeof _v20 === 'number') {
    _g18.push([_v20])
  } else {
    _g18.push(_v20)
  }
  _v22 = _v14.offset
  if (typeof _v22 === 'number') {
    _g21.push([_v22])
  } else {
    _g21.push(_v22);
  }
  _g1();
  _g2();
  _v26 = _g6[_g6.length - 1];
  if (_v26 > 0) {
    _g27.drawArraysInstancedANGLE(_g7[_g7.length - 1], _g5[_g5.length - 1], _g4[_g4.length - 1], _v26);
  } else {
    _g0.drawArrays(_g7[_g7.length - 1], _g5[_g5.length - 1], _g4[_g4.length - 1]);
  }
  _g15.pop();_g18.pop();_g21.pop();_g8.pop();_g4.pop();_g3.pop();_g10.pop();
}
