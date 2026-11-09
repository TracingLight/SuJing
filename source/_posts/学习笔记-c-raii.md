---
title: RAII详解（长篇）
date: '2026-11-08 21:20:08'
updated: '2026-11-09 22:43:45'
categories:
  - 学习笔记
tags:
  - C++
  - RAII
description: 深入解析C++中RAII（资源获取即初始化）的核心机制、三大保证与所有权模型，并说明其适用范围远不止内存管理。
cover: /img/covers/preview-upscaled-4x-mw7v0eps.webp
copyright: true
cover_position: 51.7% 24.8%
---
观前提醒：只需要懂 C++ 最基础的 `new / delete`、类的构造函数与析构函数即可无障碍阅读前半部分，涉及 `C++11` 移动语义（`std::move`）、智能指针等进阶特性时，文中仅会简单提及

> 有人说，不懂 `RAII`，你写的其实只是带 `class` 的 C 语言，但同时 C++ 社区把 `RAII` 捧上神坛几十年，写了无数条 `Core Guidelines`，现实中的大型 C++ 项目却依然在为内存泄漏和莫名其妙的崩溃而头痛不已~

## 案例引入

刚学 C++ 动态内存那会儿，几乎所有教材都会语重心长地教你一句话：每一个 `new` 必须配一个 `delete`，每一个 `new[]` 必须配一个 `delete[]`，如果错误搭配，比如使用`delete` 去释放 `new[]` 出来的数组，可能会只释放了第一个元素，导致内存泄露，或者直接触发未定义行为（`UB`）让程序崩溃

听起来很简单，对吧？有借有还，再借不难

但如果你写过大型项目或者可以想象一下随着代码量的增加，就会发现这种全靠程序员自觉的手动模式简直是场灾难，据行业统计，约 70% 的软件安全漏洞与内存管理不当直接相关

==同时 C++ 的资源泄漏风险，某种程度上比 C 语言还要凶险==

为什么？因为 C 语言没有异常机制，只要你不乱写 goto，控制流大体是线性的

而 C++ 引入了{% annotation “目前缺少异常相关文章，后面会补” %}异常控制流{% endannotation %}（Exception Control Flow），可以看看下面这段常见的代码

![image](/img/posts/image-mw7x21lt.png)

手动管理的资源获取与资源释放在代码中，空间上是分离的，一旦抛出异常，程序会立刻跳出当前执行路径，顺着调用栈往上找匹配的 catch 处理器，同时可能因为方法的代码量过大，加之没注意，而提前写了`return`返回，写在函数末尾的诸如`delete[]`、`fclose`、`unlock`等资源释放操作都会被跳过，你写的释放语句越多、越分散，异常发生时漏掉的资源可能就会越多

这可怎么办呢？界内给出了两条主流路线：

- Java / Go / Python 的选择（垃圾回收 {% annotation "Garbage Collection，垃圾回收" %}GC{% endannotation %}）：由运行时环境在后台自动回收不再使用的内存。开发者无需手动干预内存释放，代价是带来了一定的运行时性能开销，并且内存回收的时机不可控，容易产生不可预测的停顿延迟（{% annotation "垃圾回收期间暂停应用线程造成的停顿" %}Stop-The-World Pause{% endannotation %}）
- 传统 C 的选择：零运行时开销，释放时机精确到行，但可靠性随着代码规模指数级暴跌

C++ 既想要 C 语言的极致性能与零运行时开销，又不甘心天天被内存泄漏折磨，于是走出了一条独特的第三条路，也就今天我们提到的`RAII`

## 什么是 RAII？

`RAII` 的全称是 {% annotation "资源获取即初始化，RAII 的全称" %}Resource Acquisition Is Initialization{% endannotation %}（资源获取即初始化），由 C++之父 {% annotation "C++ 之父，RAII 的提出者" %}Bjarne Stroustrup{% endannotation %}最早提出

正常来说，{% annotation "C++ 之父，RAII 的提出者" %}Bjarne Stroustrup{% endannotation %}在 1980 年代设计 C++ 异常处理机制时起的这个名字，挺容易误导初学者的

<figure class="sujing-figure">
  <img src="/img/posts/image-mw7xc64m.png" alt="image" loading="lazy">
  <figcaption>一位网友的评论</figcaption>
</figure>

`RAII`的字面上它在强调获取资源发生在初始化（构造）阶段，但实际上真正的价值和机制核心在于对象销毁时（析构）自动释放资源

如果用软件工程的底层逻辑来看，`RAII` 的思想就是两个字：封装（Encapsulation）

不管是面向对象的类（`Class`）、面向过程的函数（Function），还是函数式编程的函子（Functor）、前端与游戏开发里的组件（Component），封装的本质都是将一个复杂的抽象概念简化为一个单一的简单概念，并隐藏掉内部的细节

不用 `RAII` 时，每次用资源，你都要去记住「申请、正常释放、异常释放、提前 `return` 释放、千万别释放两次」这些操作

用 `RAII` 时，则你只需要做 1 件事，那就是把资源放进一个栈对象里

![Gemini_Generated_Image_j6anwaj6anwaj6an](/img/posts/gemini-generated-image-j6anwaj6anwaj6an-mw9crw0f.jpg)

## 理想模型

那此时又有同学要说了，`RAII` 就是「构造函数里 `new`，析构函数里 `delete`」，这不就是面向对象的基本概念吗，有什么好说的？

在理论上，`RAII` 之所以被奉为黄金标准是有三大支柱和三大保证的

### 构造与析构函数

- 构造函数（入口）：在对象降生那一刻获取资源，保证对象一旦创建成功，就必然处于有效、可用的状态。如果资源获取失败（比如文件打不开、内存分配失败），标准做法是直接抛出异常

- 析构函数（出口）：在对象销毁时自动调用，把持有的资源全部归还系统

==这就建立了第一项保证，可用性保证（{% annotation "可用性保证：对象存在即资源已持有" %}Availability Guarantee{% endannotation %}），对象存在严格等价于资源已持有==

### 栈对象生命周期

析构函数凭什么一定会被调用？来自于C++ 语言标准对栈对象（自动存储期对象）的规定

栈对象的生命周期和 { ... } 作用域死死绑定在一起。

无论代码是正常走完大括号（fall through），还是中途遭遇 `return`、break、continue、goto，甚至抛出了异常触发栈展开（{% annotation "栈展开（栈解退）：异常抛出后逐层析构已构造对象的过程" %}Stack Unwinding{% endannotation %}，《C++ Primer Plus》中译作栈解退），编译器生成的清理代码都会沿着调用栈，把已构造完成的栈对象挨个析构，且严格保证只析构一次（exactly once）

不仅如此，当一个类里包含多个成员对象时，它们会严格按照在类中声明的顺序依次构造，再按照完全相反的顺序（逆序）依次析构（注意：哪怕你在构造函数初始化列表里把顺序颠倒着写，实际构造顺序依然只认声明顺序）

==这就带来了第二项保证，确定性保证（{% annotation "确定性保证：析构时机由作用域决定" %}Determinism Guarantee{% endannotation %}），这就是和{% annotation "Garbage Collection，垃圾回收" %}GC{% endannotation %}的区别了，GC 什么时候回收内存看运行时心情，而这里是固定的==

### 所有权模型

==有了机制和触发，还得解决一个问题，这块资源到底归谁管？==谁负责最后的释放？

> 《C++ Primer Plus》第 16 章里记载过一段著名的 `C++98` 翻车史，初代智能指针 `std::auto_ptr`。当年还没有移动语义，`auto_ptr` 为了实现“独占所有权”，竟然把拷贝操作（p2 = p1）写成了剥夺所有权，看起来只是赋了个值或者把指针传进了一个普通函数，但p1一下就变成空指针了，回头再访问 p1 当场崩溃，最终 `auto_ptr` 在选择中被无情淘汰，并在 `C++17` 中被正式移除

痛定思痛，`C++11` 结合全新的移动语义，把口头约定变成了编译器可检查的类型系统规则，确立了现代所有权三剑客，也就是后续我会详细写的智能指针相关内容，这里仅作简洁介绍

`std::unique_ptr`（独占所有权）

- 同一时刻只能有一个 `unique_ptr` 指向该资源
- 禁用了拷贝操作，但支持通过 `std::move` 将所有权安全地转移给另一个指针

`std::shared_ptr`（共享所有权）

- 多个 `shared_ptr` 可以同时指向同一块资源
- 内部通过原子引用计数来管理生命周期，当最后一个指向该资源的 `shared_ptr` 销毁时，资源才会被自动释放

`std::weak_ptr`（观察者语义）

- 作为 `shared_ptr` 的辅助指针，不参与所有权管理，也不增加引用计数
- 主要用于解决 `shared_ptr` 相互引用导致的循环引用

==这就是第三项保证，唯一性保证（{% annotation "唯一性保证：释放责任清晰唯一" %}Uniqueness Guarantee{% endannotation %}），释放责任永远清晰唯一==

![Gemini_Generated_Image_j6anwaj6anwaj6an1](/img/posts/gemini-generated-image-j6anwaj6anwaj6an1-mw9csl4r.jpg)

## 问答环节

既然栈对象也能自动释放，智能指针岂不是多此一举？

很多同学看到这里会冒出一个极其刁钻的问题：

> 既然普通栈对象出了作用域也会自动释放，那我直接在栈上建对象/数组不就行了？干嘛还要用 `unique_ptr` 或 vector 这种管理堆内存的 `RAII` 对象？

咳咳，我只能说，性能在其中矣

普通栈对象有一个很大缺点，当它内部直接包含大量数据，且需要按值跨函数、跨作用域传递时，往往只能发生深拷贝（Deep Copy）

如果你在栈上直接塞了一个存着百万级顶点数据的巨型结构，每次传递都是 `O(n)` 时间复杂度和 `O(n)` 额外内存的深拷贝（Deep Copy）

而 `RAII` 对象的精妙之处在于：对象壳子本身在栈上（往往只有一两个指针大小），但它管理的重型资源在堆上

配合 `C++11` 引入的右值引用（T&&）与移动语义（Move Semantics），`RAII` 对象就更是解锁了弹射起步

![image](/img/posts/image-mw7z1lmw.png)

> 细节补充，来自《C++ Primer》13.6.2：自己写 `RAII` 类的移动构造函数时，千万别忘了加上 `noexcept`，因为像 `std::vector` 在扩容重分配内存时，为了保证强异常安全，如果发现你的元素移动构造函数没标 `noexcept`（万一移动到一半抛异常，老空间已经毁了，新空间也没拼好）vector会放弃 O(1) 的移动而退化回 O(n) 的拷贝

`RAII`（保安全）+ 移动语义（O(1)高效转移）= 真正的零开销抽象（Zero-overhead Abstraction）

![Gemini_Generated_Image_j6anwaj6anwaj6an](/img/posts/gemini-generated-image-j6anwaj6anwaj6an-mw9ct6o8.jpg)

## 不止于内存

把 `RAII` 等同于智能指针管理内存，这就是对它的误解了

`RAII` 可管理的资源远不止堆空间，而是包括一切需要成对获取和释放的系统资源，这些全都在 `RAII` 射程范围之内

典型可管理资源一览

| 资源类型 | 获取操作（构造函数） | 释放操作（析构函数） |
| --- | --- | --- |
| 堆内存 | `new` / `malloc` | `delete` / `free` |
| 文件句柄 | `fopen` / `CreateFile` | `fclose` / `CloseHandle` |
| 网络连接 | `socket` / `connect` | `closesocket` / `shutdown` |
| 互斥锁 | `lock` / `mutex::lock` | `unlock` / `mutex::unlock` |
| 数据库连接 | `connect` / `open` | `disconnect` / `close` |
| 图形资源 | `CreatePen` / `LoadBitmap` | `DeleteObject` |
| 窗体句柄 | `CreateWindow` | `DestroyWindow` |

## 总结

简单总结一下吧，`RAII` 的核心，是把资源的管理责任交给对象：在初始化时获取资源，在对象销毁时释放资源，让资源的生命周期跟随管理它的对象

对于局部自动对象，正常离开作用域、提前 `return`，以及异常触发栈展开时，都会调用已经构造完成的对象的析构函数。

==构造函数和析构函数提供了基础机制，自己编写资源管理类时，还需要处理好复制行为，避免多个对象重复释放同一份资源==

日常开发中，应优先使用标准库已有的管理工具，例如管理动态数组的 `std::vector`、管理独占资源的 `std::unique_ptr`，以及管理文件的 `std::fstream`

最后，`RAII` 的适用范围远不止内存。文件、锁、网络连接等需要成对获取和释放的资源，都可以采用这一思路管理。移动语义可以进一步帮助某些资源管理对象高效转移所有权，但理解 `RAII` 本身，从构造、析构和对象生命周期开始就够了

![Gemini_Generated_Image_yocuiwyocuiwyocu](/img/posts/gemini-generated-image-yocuiwyocuiwyocu-mw9cysvz.jpg)

## 参考资料

1. LummiGhost鬼明. 【程序那些事】RAII：赛博世界的拯救者？还是老旧古董的送葬人？[EB/OL]. Bilibili, 2026-10-07[2026-11-09]. https://www.bilibili.com/video/BV1vEH16VEP4.
2. LummiGhost鬼明. 【短的C++】不懂 RAII，你就是不会 C++[EB/OL]. Bilibili, 2025-12-19[2026-11-09]. https://www.bilibili.com/video/BV1gAqpBgEb2.
3. 夏曹俊. 理解C++唯一重要概念RAII,怎么解决内存安全问题,代码演示 #C++ #RAII #智能指针[EB/OL]. Bilibili, 2025-01-09[2026-11-09]. https://www.bilibili.com/video/BV1E9rkYwERm.
