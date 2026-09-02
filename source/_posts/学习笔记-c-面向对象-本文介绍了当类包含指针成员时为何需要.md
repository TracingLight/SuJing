---
title: 拷贝构造函数
date: '2026-09-01 20:40:44'
updated: '2026-09-01 20:40:44'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍了当类包含指针成员时为何需要深拷贝，以及拷贝构造函数的声明、内存分配与内容复制的实现步骤。
cover: /img/covers/c-c-mtinc5qq.webp
copyright: true
cover_position: 53.7% 40.2%
---

当类包含指针成员并持有动态分配的内存时，编译器默认的浅拷贝（只复制指针值）会导致内存泄漏、双重释放和指针别名（Aliasing）等问题，故而必须由我们显式定义拷贝构造函数，实现 深拷贝（deep copy）来解决这样的问题。

## 拷贝构造函数的语法与声明规范

拷贝构造函数是一种特殊的构造函数，其参数是**本类对象的常量引用**。对于字符串类（例如 class String），其典型的声明如下：

```cpp
class String {
public:
    String(const String& other);  // 拷贝构造函数
    // ...
};
```

>为什么必须用引用？
>如果参数是传值（`String(String other)`），调用拷贝构造函数时，形参的初始化会再次调用拷贝构造函数，形成无限递归，导致编译错误或栈溢出。使用 `const &` 既避免递归，又保证不会修改原对象。

## 计算目标内存大小

深拷贝的第一步是确定需要分配多少内存。对于 C 风格字符串，需要使用 `strlen` 获取字符串长度，然后 **加 1** 预留存放字符串结束符 `'\0'` 的空间。

>size_t len = strlen(other.data) + 1;  // +1 为 '\0'
>其中 other.data 是原对象中的 char* 指针成员。如果不加 1，拷贝后的字符串将缺少结束符，导致后续操作（如 strcpy、cout）发生缓冲区溢出或打印乱码。

注意：对于非字符串类型（如 `int*` 数组），计算大小时应使用 `sizeof(int) * length`，而不是 `strlen`。`strlen` 只适用于以 `'\0'` 结尾的字符数组。混淆两者会导致内存分配不足或程序崩溃。

## 使用 new 动态分配内存

计算出所需大小后，使用 `new[]` 运算符在堆上分配相应大小的内存。对于字符串类，分配的是 `char` 数组。

>char* new_data = new char[len];  // len = strlen(other.data) + 1

分配失败怎么办？
在标准 C++ 中，`new` 分配失败会抛出 `std::bad_alloc` 异常，而不是返回空指针。因此不需要检查返回值为 `nullptr`。如果需要处理异常，可以在拷贝构造函数中使用 `try-catch` 包裹 `new` 语句。

![image](/img/posts/image-mtinm5wo.png)

## 使用 strcpy 复制内容

内存分配完成后，使用 `strcpy` 将原对象中的字符串内容**逐字节**复制到新分配的内存中。`strcpy` 会复制包括结束符 `'\0'` 在内的所有字符。

>strcpy(new_data, other.data);  // 复制内容，包括 '\0'

完整拷贝构造函数实现:

```cpp
String::String(const String& other) {
    size_t len = strlen(other.data) + 1;  // 计算大小
    data = new char[len];                 // 分配内存
    strcpy(data, other.data);             // 复制内容
}
```


