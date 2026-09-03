---
title: 模板
date: '2026-09-03 22:21:18'
updated: '2026-09-03 22:21:18'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍C++模板机制，讲解类模板、函数模板、实参推导与实例化，以解决不同数据类型的代码复用问题。
cover: /img/covers/c-o-e-mtllywu2.webp
copyright: true
---

在学习了如何为特定类型（如 `double`）设计类（如复数类）和函数后，我们面临一个工程上的核心问题： 当算法逻辑相同，但需要处理的数据类型不同时，我们是否必须为每种类型都重复编写几乎相同的代码？

本篇将介绍C++的“模板”机制，它允许我们编写与类型无关的通用代码，从根本上解决代码复用问题。

## 模板声明

这是所有模板定义的起点，用于告诉编译器：接下来的代码是一个“模具”，其中包含一个或多个类型参数。

核心概念：模板声明 (Template Declaration)

语法： template <typename T> 或 template <class T>。 `typename` 和 `class` 在此处含义完全相同，都表示 `T` 是一个类型占位符。

作用： 这行代码声明了模板参数列表。`T` 是一个未绑定的符号，代表某种未来会被指定的数据类型（如 `int`, `double`, `string`, 或自定义的类）。

## 类模板

当我们需要一个类，其内部某些成员（如数据成员、函数参数/返回类型）的类型可以灵活变化时，就使用类模板。

核心概念：类模板 (Class Template)

定义： 在类定义前加上模板声明，并将类体中需要参数化的具体类型（如 `double`）替换为模板参数（如 `T`）。

示例（将复数类改造为模板）

```cpp
// 1. 声明模板，T是类型占位符
template <typename T>
class Complex {
private:
    T real;  // 实部类型为T
    T imag;  // 虚部类型为T

public:
    // 构造函数参数类型也为T
    Complex(T r = 0, T i = 0) : real(r), imag(i) {}

    // 成员函数返回类型和参数类型也用T
    Complex<T> add(const Complex<T>& other) const {
        return Complex<T>(real + other.real, imag + other.imag);
    }

    T getReal() const { return real; }
    T getImag() const { return imag; }
};

// 2. 如何使用这个“模具”？
// 编译器会根据我们指定的类型生成具体代码
Complex<double> c1(3.5, 4.2);  // 生成处理double的Complex类
Complex<int> c2(3, 4);        // 生成处理int的Complex类
Complex<float> c3(3.0f, 4.0f); // 生成处理float的Complex类
```

常见误区：模板声明的位置

模板声明 template <typename T> 必须紧邻在类定义之前，中间不能有其他代码。 同时，在类外部定义成员函数时，也需要重复这个模板声明。

```cpp
❌ 错误示例：
// 错误！中间有其他声明
template <typename T>
using Alias = T;  // 这行把模板声明「使用」
class Complex { ... };  // 这个类没有模板声明了！
✅ 正确示例：
// 类外部定义成员函数
template <typename T>  // 必须再次声明
Complex<T> Complex<T>::add(const Complex<T>& other) const {
    return Complex<T>(real + other.real, imag + other.imag);
}
```

## 函数模板

当我们需要一个函数，其逻辑相同但参数类型不同时，使用函数模板。这是C++标准库（如 `std::sort`, `std::max`）大量使用的技术。

核心概念：函数模板 (Function Template)

定义： 在函数定义前加上模板声明，将函数的参数类型或返回类型替换为模板参数。

优点： 一次编写，多处使用。编译器会根据调用时的实际类型自动生成对应的函数版本。

示例：通用交换函数和最大值函数

```cpp
// 1. 交换任意两个同类型变量的值
template <typename T>
void mySwap(T& a, T& b) {
    T temp = a;
    a = b;
    b = temp;
}

// 2. 返回两个任意同类型变量的较大值
template <typename T>
T myMax(const T& a, const T& b) {
    return (a > b) ? a : b;
}

// 3. 使用示例
int x = 5, y = 10;
mySwap(x, y);           // 编译器生成 mySwap<int> 版本
// x=10, y=5

double d1 = 3.14, d2 = 2.71;
double maxVal = myMax(d1, d2);  // 编译器生成 myMax<double> 版本
// maxVal = 3.14

std::string s1 = "hello", s2 = "world";
std::string sMax = myMax(s1, s2);  // 编译器生成 myMax<std::string> 版本
// sMax = "world"（按字典序比较）
```

> 补充：模板代码对类型 `T` 有隐式要求。例如`myMax` 函数要求类型 `T` 必须支持 `>` 运算符，`mySwap` 要求类型 `T` 支持拷贝构造和赋值。 如果使用不支持这些操作的类型，编译器会在实例化时报错，而不是在模板定义时。
> 这种“在使用时检查”的特性，是C++模板与Java/C#泛型的重要区别之一，也是模板更灵活但也更易出错的原因。

## 实参推导

对于函数模板，编译器通常能够根据函数调用时传递的实参类型，自动推导出模板参数 `T` 的具体类型，无需显式指定。

推导规则
- 根据函数调用时的实参类型推导
- 所有实参推导出的类型必须一致
- 无法推导时需显式指定类型

代码示例

```cpp
template <typename T>
void printPair(T a, T b) {
    std::cout << a << ", " << b << std::endl;
}

// 编译器推导过程：
printPair(10, 20);      // T 被推导为 int
printPair(3.14, 2.71);  // T 被推导为 double
printPair('a', 'b');    // T 被推导为 char

// 错误：类型不一致，无法推导
// printPair(10, 3.14);  // 错误！第一个是int，第二个是double

// 解决：显式指定类型
printPair<double>(10, 3.14);  // 正确！显式指定T为double
```

## 模板实例化

模板本身不是可执行代码，它只是一个“蓝图”。只有当使用模板并指定具体类型时，编译器才会根据这个蓝图生成实际的类或函数代码，这个过程称为模板实例化。

核心概念：模板实例化 (Template Instantiation)

时机： 发生在编译阶段，而非运行阶段。
结果： 为每个不同的类型组合生成一份独立的代码。
隐式实例化：编译器根据使用自动生成。
显式实例化：程序员手动指定生成特定类型的版本。

![image](/img/posts/image-mtlm4xpp.png)

