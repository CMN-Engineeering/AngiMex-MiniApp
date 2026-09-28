CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(100) PRIMARY KEY,
    categoryID VARCHAR(100) NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    stock NUMERIC DEFAULT 0,
    discount_price NUMERIC DEFAULT 0,
    origin_price NUMERIC NOT NULL,
    image_src TEXT,
    detail TEXT
);

INSERT INTO products (
    id,
    categoryID,
    product_name,
    discount_price,
    origin_price,
    image_src,
    detail,
    is_hidden
)
VALUES
    ('1', '1', 'Gạo San Sẻ Yêu Thương', 87500, 100000,
     'https://angimexfood.com/uploads/sanpham/gao-san-se-yeu-thuong-1780448979-ewcmr.png',
     'Gạo Trắng được trồng phổ biến tại khắp các vùng thuộc khu vực ĐBSCL. Gạo Trắng là loại gạo thông dụng với mức giá phổ thông phù hợp cho mọi bữa ăn.',
     't'),
    ('2', '1', 'Gạo Thượng Hạng', 180000, 200000,
     'https://angimexfood.com/uploads/sanpham/gao-thuong-hang-1691464877-fkdwd.png',
     'Gạo An Gia Thượng Hạng là sản phẩm gạo cao cấp nhất của Angimex Food được tuyển chọn kỹ lưỡng qua những giống lúa đặc sản, canh tác theo qui trình nghiêm ngặt tạo ra những hạt gạo chuẩn Việt, mang lại bữa cơm thơm ngon, đậm đà hương vị, an toàn sức khỏe cho mọi nhà.'),
    ('3', '1', 'Gạo Lúa Tôm', 175000, 200000,
     'https://angimexfood.com/uploads/sanpham/gao-lua-tom-1691464031-2rwhv.png',
     'Gạo Lúa Tôm An Gia là sản phẩm thượng hạng, được trồng từ giống lúa chất lượng cao trên những vùng đất luân canh lúa - tôm tự nhiên vốn giàu chất dinh dưỡng, hạt gạo thành phẩm được sản xuất chế biến dưới các quy trình kiểm soát nghiêm ngặt, đem lại bữa cơm dinh dưỡng, an toàn, tốt cho sức khỏe của người tiêu dùng.'),
    ('4', '1', 'Gạo Tấm Thơm', 95500, 100000,
     'https://angimexfood.com/uploads/sanpham/gao-tam-thom-1642389294-to23a.png',
     'Gạo nhãn hiệu Mục Đồng được tuyển chọn kỹ lưỡng, qua nhiều công đoạn bảo quản chế biến, kiểm nghiệm chặt chẽ, luôn mang đến sự an toàn và hương vị thơm ngon cho mọi gia đình. Tấm Thơm là những hạt gạo bị vỡ trong quá trình xử lý, tấm không đều hạt nhưng được sử dụng nhiều nhất trong việc hòa trộn với nhiều loại gạo khác làm cho bữa ăn đậm phần đa vị.'),
    ('5', '1', 'Gạo Thơm Hương Jasmine', 120000, 150000,
     'https://angimexfood.com/uploads/sanpham/gao-thom-huong-jasmine-1786346815-ogrow.png',
     'Gạo cao cấp An Gia với chất lượng tuyệt hảo, tuyển chọn từ những giống lúa đặc sản, qua nhiều công đoạn bảo quản, chế biến, kiểm nghiệm chặt chẽ, sẽ mang lại bữa cơm thơm ngon và an toàn sức khỏe cho mọi gia đình.'),
    ('6', '1', 'Gạo Sóc Thái', 115000, 125000,
     'https://angimexfood.com/uploads/sanpham/gao-soc-thai-1626929192-iwnnl.jpg',
     'Gạo cao cấp An Gia với chất lượng tuyệt hảo, tuyển chọn từ những giống lúa đặc sản, qua nhiều công đoạn bảo quản, chế biến, kiểm nghiệm chặt chẽ, sẽ mang lại bữa cơm thơm ngon và an toàn sức khỏe cho mọi gia đình.')
ON CONFLICT (id) DO UPDATE SET
    categoryID = EXCLUDED.categoryID,
    product_name = EXCLUDED.product_name,
    discount_price = EXCLUDED.discount_price,
    origin_price = EXCLUDED.origin_price,
    image_src = EXCLUDED.image_src,
    detail = EXCLUDED.detail;
