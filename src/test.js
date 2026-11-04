const test = '{"Gạo San Sẻ Yêu Thương":1,"Gạo Thượng Hạng":5,"Gạo Tấm Thơm":4}';

const data = Object.entries(JSON.parse(test)).map(([name, quantity]) => ({
    name,
    quantity
}));

console.log(data);