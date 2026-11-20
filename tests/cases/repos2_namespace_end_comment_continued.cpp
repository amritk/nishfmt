namespace tbb {
namespace internal {
    void NFS_Free( void* );
    void NFS_Other( void* );
}
    // Workaround for erroneous "unreferenced parameter" warning in method destroy.
#if _MSC_VER
    // A comment read after a directive also continues the end comment.
    #pragma warning (push)
#endif
namespace other {
    int a;
    int b;
}
// At the brace's column: a comment of its own.
}
