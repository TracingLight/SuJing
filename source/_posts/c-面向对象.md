---
title: 类的具体设计：数据成员、成员函数与模板
date: '2026-07-26 12:46:19'
updated: '2026-07-27 01:42:58'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文以复数类为例，系统讲解C++类的设计，涵盖数据成员、成员函数（含const、友元和运算符重载）以及类模板的用法。
cover: /img/covers/e-c-3a-ms1rr8bn.webp
copyright: true
cover_position: 48.2% 50.6%
---

在了解了头文件的防卫式声明之后，现在我们要真正动笔设计一个类了。本篇以复数为例，手把手带你搭建一个完整的类：从决定类里装什么数据（实部、虚部），到设计操作这些数据的函数（如取共轭），如果实部、虚部的类型想从 double 换成 int 时，难道要重写一遍类吗？C++ 为此提供了模板机制。

## class 关键字与类的作用域

任何一个类，无论多复杂，其最外层的结构都是固定的。由 class 关键字引导，后跟类名，接着用花括号 { } 划定类的作用域，最后以分号结束。

```cpp
class 类名 {
    // 数据成员与成员函数
};  // ← 分号必不可少
```

> 初学 C++ 时，最容易遗漏的就是类定义末尾的分号。这和函数、循环等结构不同，花括号后不加分号会导致编译错误。将类定义视为一种“类型声明”，就像声明结构体一样，末尾必须加分号。

## 数据成员

数据成员是类的“属性”，用来存储对象的状态。以复数类为例，它需要两个数据成员：实部与虚部，通常用 double 类型表示。

复数类的数据成员:

```cpp
class Complex {
    double real;  // 实部
    double imag;  // 虚部
};
```

设计要点:
- 数据成员通常设为 private（默认就是 private）
- 通过成员函数来访问和修改
- 命名风格：常用下划线或 m_ 前缀

> 类的默认访问权限是 private，但很多人误以为默认是 public。如果忘记写 public:，外部代码无法直接访问数据成员。建议在类定义中明确写出访问说明符，避免混淆。

## 成员函数

成员函数定义了对象可以执行的操作，是类的“行为”。对于复数类，常见的操作包括取共轭、加法、输出等。成员函数可以在类内定义（自动成为 inline），也可以在类外通过作用域解析运算符 :: 定义。

共轭函数（类内定义）：

```cpp
class Complex {
public:
    double real() const { return real; }
    double imag() const { return imag; }
};
```

运算符重载（类外定义）

```cpp
Complex operator+(const Complex& a, 
                  const Complex& b) {
    return Complex(a.real() + b.real(),
                   a.imag() + b.imag());
}
```
 
友元（friend）

如果希望非成员函数（如运算符重载）直接访问类的私有成员，可以将它声明为友元。友元函数不是类的成员函数，但可以访问所有私有成员。使用需谨慎，它会破坏封装性。

```cpp
class Complex {
    friend Complex operator+(const Complex&, const Complex&);
    // ...
};
```

> const 成员函数表示该函数不会修改对象的数据成员，是良好的设计习惯。对于只读的访问函数（如 real()、imag()），务必加上 const。

## 类的通用化：模板（Template）

如果复数类的实部和虚部需要支持 `int`、`float`、`double` 等多种类型，难道要复制粘贴多份代码吗？C++ 的类模板可以解决这个问题：将数据类型参数化，使用时再指定具体类型。

模板类定义：

```cpp
template <typename T>
class Complex {
public:
    Complex(T r, T i) : real(r), imag(i) {}
    T real() const { return real; }
    T imag() const { return imag; }
private:
    T real;
    T imag;
};
```

使用示例：

```cpp
Complex<double> c1(1.0, 2.0);
Complex<int> c2(3, 4);
Complex<float> c3(5.0f, 6.0f);
```

> 模板的声明和定义通常需要放在同一个头文件中（或包含 .tpp 文件），不能像普通函数那样将声明放 .h、定义放 .cpp，否则链接时会出现“未定义引用”错误。这是因为模板在实例化时需要完整的定义。

> 模板参数不限于类型，也可以是非类型参数，如整数或指针。例如，可以定义一个固定长度的数组类：
> template <typename T, int N> class Array { ... };
>  使用时：Array<double, 10> arr;

